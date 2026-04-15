/// Mines GameFi — 4x4 格子 Mines 遊戲，部署於 Sui 區塊鏈
///
/// 架構概覽：
///   - GamePlatform（共享對象）：持有金庫、配置、及準備金追蹤
///   - AdminCap（擁有對象）：管理員權限憑證
///   - PlayerBalance（玩家擁有對象）：玩家存款餘額，無需每局重新轉帳
///   - GameSession（玩家擁有對象）：單局遊戲狀態
///
/// 遊戲規則：
///   - 4x4 格子（16格），隱藏 5 枚炸彈
///   - 玩家逐格揭開，每揭一個安全格賠率倍數上升
///   - 觸發炸彈：押注全失，歸入金庫
///   - 收手（cashout）：按當前倍數結算，含莊家優勢折扣
///
/// 隨機性：採用「懶惰式」機率採樣（lazy probabilistic sampling）
///   - 開局不預先分配炸彈位置（避免位置存儲在鏈上被讀取）
///   - 每次揭格時，以 bombs_remaining / tiles_remaining 機率判定是否炸彈
///   - 使用 Sui 官方 sui::random 模組，驗證者共識保障不可預測
module gamefi::mines {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::random::{Self, Random};
    use sui::clock::Clock;
    use sui::event;
    use gamefi::tsui::TSUI;
    use gamefi::usdc::USDC;
    use gamefi::lottery::{Self, LotterySystem};

    // === 常數 ===

    /// 格子總數
    const GRID_SIZE: u64 = 16;
    /// 炸彈數量
    const BOMB_COUNT: u64 = 5;
    /// 安全格數量
    const SAFE_COUNT: u64 = 11;

    /// 倍數精度：MULTIPLIER_SCALE 代表 1.0x
    const MULTIPLIER_SCALE: u64 = 1_000_000_000;

    /// 含每步 5% 莊家優勢後的實際最大倍數
    /// = C(16,5) × 0.95^11 = 4368 × 0.95^11 ≈ 2484.7，向上取整保守預留
    /// 用於 reserved_amount 計算，確保金庫始終能支付最大可能賠付
    const MAX_MULTIPLIER_WITH_EDGE: u64 = 2485;

    /// 莊家優勢上限：1000 bps = 10%
    const MAX_HOUSE_EDGE_BPS: u64 = 1000;

    /// 獎池抽成比例：莊家利潤的 5% 注入抽獎獎池
    const PRIZE_POOL_BPS: u64 = 500; // 500 / 10000 = 5%

    /// 單局最大賠付預設值：50 SUI
    /// 玩家單局能贏取的上限，防止大額幸運連勝清空金庫
    const DEFAULT_MAX_SINGLE_PAYOUT: u64 = 50_000_000_000;

    /// USDC 單局最大賠付預設值：200 USDC（6 位小數）
    /// 與 SUI 分開設定，避免兩種幣種精度差異導致預留金額膨脹
    const DEFAULT_MAX_SINGLE_PAYOUT_USDC: u64 = 200_000_000;

    /// 超時 epoch 數：超過此值的進行中遊戲可被強制結算
    /// Sui 每個 epoch ≈ 24 小時，7 epochs ≈ 7 天
    const SESSION_EXPIRE_EPOCHS: u64 = 7;

    // 遊戲狀態碼
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_EXPLODED: u8 = 1;

    // 錯誤碼
    const EInsufficientBalance: u64 = 1;
    const EBetTooSmall: u64 = 2;
    const EBetTooLarge: u64 = 3;
    const EGameNotActive: u64 = 4;
    const EInvalidTile: u64 = 5;
    const ETileAlreadyRevealed: u64 = 6;
    const EInsufficientTreasury: u64 = 7;
    const EPlatformPaused: u64 = 8;
    const EAllSafeRevealed: u64 = 9;
    const EHouseEdgeTooHigh: u64 = 10;
    const EGameStillActive: u64 = 11;
    const EInvalidBetLimits: u64 = 12;
    const ESessionNotExpired: u64 = 13;
    const EBetExceedsSinglePayoutCap: u64 = 14;
    const EInvalidPayoutCap: u64 = 15;
    const ECannotCancelAfterReveal: u64 = 16;

    // === 結構體 ===

    /// 遊戲平台（共享對象）
    /// 持有 SUI 與 USDC 金庫、準備金追蹤、及平台配置
    public struct GamePlatform has key {
        id: UID,
        /// SUI 金庫，用於支付玩家獲勝賠付
        treasury: Balance<TSUI>,
        /// SUI 遊戲進行中的已預留淨賠付總和
        reserved: u64,
        /// USDC 金庫
        usdc_treasury: Balance<USDC>,
        /// USDC 遊戲進行中的已預留淨賠付總和
        usdc_reserved: u64,
        /// 莊家優勢（basis points，例如 300 = 3%）
        house_edge_bps: u64,
        /// SUI 最低押注（MIST 單位）
        min_bet: u64,
        /// SUI 最高押注（MIST 單位）
        max_bet: u64,
        /// USDC 最低押注（raw USDC 單位，獨立於 SUI）
        min_bet_usdc: u64,
        /// USDC 最高押注（raw USDC 單位，獨立於 SUI）
        max_bet_usdc: u64,
        /// SUI 單局最大賠付上限（含押注本金，單位 MIST）
        max_single_payout: u64,
        /// USDC 單局最大賠付上限（含押注本金，單位 raw USDC = 10^-6）
        max_single_payout_usdc: u64,
        /// 管理員地址
        admin: address,
        /// 是否暫停
        paused: bool,
    }

    /// 管理員憑證（擁有對象）
    public struct AdminCap has key, store {
        id: UID,
    }

    /// 玩家 SUI 存款餘額（玩家擁有對象）
    public struct PlayerBalance has key {
        id: UID,
        balance: Balance<TSUI>,
    }

    /// 玩家 USDC 存款餘額（玩家擁有對象）
    public struct PlayerBalanceUSDC has key {
        id: UID,
        balance: Balance<USDC>,
    }

    /// 單局 SUI 遊戲會話（玩家擁有對象）
    public struct GameSession has key {
        id: UID,
        /// 玩家地址
        player: address,
        /// 押注金額
        bet_amount: u64,
        /// 實際存放押注的餘額（遊戲結束時轉出）
        bet_balance: Balance<TSUI>,
        /// 尚未揭開的格子數
        tiles_remaining: u64,
        /// 尚未判定的炸彈數
        bombs_remaining: u64,
        /// 尚未判定的安全格數
        safe_remaining: u64,
        /// 已揭開的安全格數
        safe_revealed: u64,
        /// 已揭開格子的位元遮罩（bit i 代表格子 i 是否已揭開）
        revealed_mask: u64,
        /// 當前賠率倍數（以 MULTIPLIER_SCALE 為精度）
        current_multiplier: u64,
        /// 遊戲狀態：STATUS_ACTIVE 或 STATUS_EXPLODED
        status: u8,
        /// 開局時的 epoch（用於超時判斷）
        start_epoch: u64,
        /// 開局時從金庫預留的淨賠付金額
        /// 存儲此值確保 cashout/expire 釋放的金額與預留時完全一致，
        /// 不受後續 max_single_payout 參數變更影響
        reserved_amount: u64,
    }

    /// 單局 USDC 遊戲會話（玩家擁有對象）
    public struct GameSessionUSDC has key {
        id: UID,
        player: address,
        bet_amount: u64,
        bet_balance: Balance<USDC>,
        tiles_remaining: u64,
        bombs_remaining: u64,
        safe_remaining: u64,
        safe_revealed: u64,
        revealed_mask: u64,
        current_multiplier: u64,
        status: u8,
        start_epoch: u64,
        reserved_amount: u64,
    }

    // === 事件 ===

    public struct GameStarted has copy, drop {
        game_id: ID,
        player: address,
        bet_amount: u64,
    }

    public struct TileRevealed has copy, drop {
        game_id: ID,
        player: address,
        tile_index: u64,
        is_bomb: bool,
        /// 揭開後的當前倍數（炸彈時為 0）
        multiplier: u64,
        /// 若此刻收手可獲得的金額
        potential_payout: u64,
    }

    public struct GameCashedOut has copy, drop {
        game_id: ID,
        player: address,
        safe_revealed: u64,
        payout: u64,
    }

    public struct GameExploded has copy, drop {
        game_id: ID,
        player: address,
        tile_index: u64,
        bet_lost: u64,
    }

    public struct GameExpired has copy, drop {
        game_id: ID,
        player: address,
        /// 被沒收進金庫的押注金額
        bet_confiscated: u64,
        /// 釋放的預留資金
        reserved_released: u64,
    }

    public struct GameCancelled has copy, drop {
        game_id: ID,
        player: address,
        /// 全額退回的押注金額
        bet_amount: u64,
        bet_refunded: u64,
    }

    // === 初始化 ===

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap { id: object::new(ctx) };
        let platform = GamePlatform {
            id: object::new(ctx),
            treasury: balance::zero(),
            reserved: 0,
            usdc_treasury: balance::zero(),
            usdc_reserved: 0,
            house_edge_bps: 500,                       // 預設 5% 莊家優勢
            min_bet: 10_000_000,                       // SUI: 0.01 SUI
            max_bet: 10_000_000_000,                   // SUI: 10 SUI
            min_bet_usdc: 1_000_000,                   // USDC: 1 USDC
            max_bet_usdc: 10_000_000,                  // USDC: 10 USDC
            max_single_payout: DEFAULT_MAX_SINGLE_PAYOUT,
            max_single_payout_usdc: DEFAULT_MAX_SINGLE_PAYOUT_USDC,
            admin: ctx.sender(),
            paused: false,
        };
        transfer::share_object(platform);
        transfer::transfer(admin_cap, ctx.sender());
    }

    // === 玩家餘額管理 ===

    /// 為呼叫者建立新的存款帳戶
    public fun create_player_balance(ctx: &mut TxContext) {
        let pb = PlayerBalance {
            id: object::new(ctx),
            balance: balance::zero(),
        };
        transfer::transfer(pb, ctx.sender());
    }

    /// 存入 SUI 到玩家帳戶
    public fun deposit(
        player_balance: &mut PlayerBalance,
        payment: Coin<TSUI>,
    ) {
        balance::join(&mut player_balance.balance, coin::into_balance(payment));
    }

    /// 從玩家帳戶提取指定金額
    public fun withdraw(
        player_balance: &mut PlayerBalance,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<TSUI> { // 1. 這裡加入回傳型別
        assert!(balance::value(&player_balance.balance) >= amount, EInsufficientBalance);
        let withdrawn = balance::split(&mut player_balance.balance, amount);
    
        // 2. 直接回傳 Coin 物件，不要調用 transfer
        coin::from_balance(withdrawn, ctx)
    }

    /// 提取玩家帳戶全部餘額
    public fun withdraw_all(
        player_balance: &mut PlayerBalance,
        ctx: &mut TxContext,
    ): Coin<TSUI> {
        let amount = balance::value(&player_balance.balance);
        assert!(amount > 0, EInsufficientBalance);
        let withdrawn = balance::split(&mut player_balance.balance, amount);
        coin::from_balance(withdrawn, ctx)
    }

    // === USDC 玩家餘額管理 ===

    /// 為呼叫者建立 USDC 存款帳戶
    public fun create_player_balance_usdc(ctx: &mut TxContext) {
        let pb = PlayerBalanceUSDC {
            id: object::new(ctx),
            balance: balance::zero(),
        };
        transfer::transfer(pb, ctx.sender());
    }

    /// 存入 USDC 到玩家帳戶
    public fun deposit_usdc(
        player_balance: &mut PlayerBalanceUSDC,
        payment: Coin<USDC>,
    ) {
        balance::join(&mut player_balance.balance, coin::into_balance(payment));
    }

    /// 從玩家帳戶提取指定 USDC 金額
    public fun withdraw_usdc(
        player_balance: &mut PlayerBalanceUSDC,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<USDC> {
        assert!(balance::value(&player_balance.balance) >= amount, EInsufficientBalance);
        coin::from_balance(balance::split(&mut player_balance.balance, amount), ctx)
    }

    /// 提取玩家帳戶全部 USDC
    public fun withdraw_all_usdc(
        player_balance: &mut PlayerBalanceUSDC,
        ctx: &mut TxContext,
    ): Coin<USDC> {
        let amount = balance::value(&player_balance.balance);
        assert!(amount > 0, EInsufficientBalance);
        coin::from_balance(balance::split(&mut player_balance.balance, amount), ctx)
    }

    /// 將抽獎 SUI 獎金存入玩家帳戶（由 PTB 串接 lottery::claim_prize 呼叫）
    public fun deposit_prize_sui(
        player_balance: &mut PlayerBalance,
        prize: Coin<TSUI>,
    ) {
        if (coin::value(&prize) > 0) {
            balance::join(&mut player_balance.balance, coin::into_balance(prize));
        } else {
            coin::destroy_zero(prize);
        }
    }

    /// 將抽獎 USDC 獎金存入玩家帳戶（由 PTB 串接 lottery::claim_prize 呼叫）
    public fun deposit_prize_usdc(
        player_balance: &mut PlayerBalanceUSDC,
        prize: Coin<USDC>,
    ) {
        if (coin::value(&prize) > 0) {
            balance::join(&mut player_balance.balance, coin::into_balance(prize));
        } else {
            coin::destroy_zero(prize);
        }
    }

    // === 遊戲核心邏輯 ===

    /// 開始新的遊戲會話
    ///
    /// 從玩家的 PlayerBalance 扣除押注金額，建立 GameSession 對象
    /// 同時驗證金庫有足夠的未預留資金覆蓋理論最大賠付
    public fun start_game(
        platform: &mut GamePlatform,
        player_balance: &mut PlayerBalance,
        bet_amount: u64,
        ctx: &mut TxContext,
    ): GameSession {
        assert!(!platform.paused, EPlatformPaused);
        assert!(bet_amount >= platform.min_bet, EBetTooSmall);
        assert!(bet_amount <= platform.max_bet, EBetTooLarge);
        // 押注不可超過單局賠付上限（否則即使贏了也只能賠上限，開局無意義）
        assert!(bet_amount <= platform.max_single_payout, EBetExceedsSinglePayoutCap);
        assert!(balance::value(&player_balance.balance) >= bet_amount, EInsufficientBalance);

        // 計算本局實際需預留的淨賠付（取較小值）：
        //   theoretical = bet * (MAX_MULTIPLIER_WITH_EDGE - 1)  ← 含每步 5% 後的實際最大淨賠
        //   capped       = max_single_payout - bet               ← 單局賠付封頂後的最大淨賠
        // 取兩者最小，避免為不可能發生的超額賠付鎖住金庫資金
        let theoretical_net = (bet_amount as u128) * ((MAX_MULTIPLIER_WITH_EDGE - 1) as u128);
        let capped_net = (platform.max_single_payout as u128) - (bet_amount as u128);
        let reserved_amount = if (theoretical_net < capped_net) {
            theoretical_net as u64
        } else {
            capped_net as u64
        };

        let treasury_available =
            (balance::value(&platform.treasury) as u128) - (platform.reserved as u128);
        assert!((treasury_available as u128) >= (reserved_amount as u128), EInsufficientTreasury);

        // 預留本局實際最大淨賠付至 reserved
        platform.reserved = platform.reserved + reserved_amount;

        // 從玩家帳戶扣除押注，存入遊戲會話
        let bet_balance = balance::split(&mut player_balance.balance, bet_amount);

        let game = GameSession {
            id: object::new(ctx),
            player: ctx.sender(),
            bet_amount,
            bet_balance,
            tiles_remaining: GRID_SIZE,
            bombs_remaining: BOMB_COUNT,
            safe_remaining: SAFE_COUNT,
            safe_revealed: 0,
            revealed_mask: 0,
            current_multiplier: MULTIPLIER_SCALE, // 初始 1.0x
            status: STATUS_ACTIVE,
            start_epoch: ctx.epoch(),
            reserved_amount,
        };

        event::emit(GameStarted {
            game_id: object::id(&game),
            player: ctx.sender(),
            bet_amount,
        });

        game
    }

    /// 將 GameSession 存回呼叫者（當 PTB 不需要繼續鏈接時使用）
    public fun keep_game(game: GameSession, ctx: &mut TxContext) {
        transfer::transfer(game, ctx.sender());
    }

    /// 揭開一個格子
    ///
    /// 使用 Sui on-chain 隨機數（sui::random）以懶惰機率採樣判定是否炸彈：
    ///   P(炸彈) = bombs_remaining / tiles_remaining
    ///
    /// 安全格：按倍數公式更新倍數（含莊家優勢折扣）
    /// 炸彈格：押注歸零，全數轉入金庫，遊戲結束
    ///
    /// 安全性：此函數定義為 entry，確保只能由 PTB 直接呼叫，
    /// 無法被其他 Move 合約組合（防止「翻牌後反悔」攻擊：
    /// 惡意合約在收到炸彈結果後 abort 整筆交易以重試）。
    entry fun reveal_tile(
        platform: &mut GamePlatform,
        game: &mut GameSession,
        tile_index: u64,
        rand: &Random,
        lottery: &mut LotterySystem,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);
        assert!(tile_index < GRID_SIZE, EInvalidTile);
        // 驗證該格尚未揭開（位元遮罩檢查）
        assert!((game.revealed_mask >> (tile_index as u8)) & 1 == 0, ETileAlreadyRevealed);
        // 若所有安全格已找完，強制收手，不允許繼續揭格（下一格必為炸彈）
        assert!(game.safe_remaining > 0, EAllSafeRevealed);

        // 標記該格為已揭開
        game.revealed_mask = game.revealed_mask | (1u64 << (tile_index as u8));
        let tiles_before = game.tiles_remaining;
        game.tiles_remaining = game.tiles_remaining - 1;

        // 懶惰式炸彈判定：
        // 在 [0, tiles_before - 1] 中均勻隨機一個整數
        // 若結果 < bombs_remaining，則為炸彈
        let mut gen = random::new_generator(rand, ctx);
        let roll = random::generate_u64_in_range(&mut gen, 0, tiles_before - 1);
        let is_bomb = roll < game.bombs_remaining;

        if (is_bomb) {
            // ---- 炸彈！遊戲結束 ----
            game.bombs_remaining = game.bombs_remaining - 1;
            game.status = STATUS_EXPLODED;

            // 5% 押注注入 SUI 獎池，剩餘 95% 進金庫
            let bet_val = balance::value(&game.bet_balance);
            let prize_cut = bet_val * PRIZE_POOL_BPS / 10000;
            if (prize_cut > 0) {
                let prize_balance = balance::split(&mut game.bet_balance, prize_cut);
                lottery::add_prize_sui(lottery, prize_balance);
            };
            let remaining = balance::value(&game.bet_balance);
            if (remaining > 0) {
                let lost = balance::split(&mut game.bet_balance, remaining);
                balance::join(&mut platform.treasury, lost);
            };

            // 釋放預留資金（使用開局時存儲的精確值，不重新計算）
            platform.reserved = platform.reserved - game.reserved_amount;

            // 發放彩票 NFT 到玩家錢包
            let ticket = lottery::issue_ticket(lottery, game.player, game.bet_amount, clock, ctx);
            transfer::public_transfer(ticket, game.player);

            event::emit(TileRevealed {
                game_id: object::id(game),
                player: game.player,
                tile_index,
                is_bomb: true,
                multiplier: 0,
                potential_payout: 0,
            });
            event::emit(GameExploded {
                game_id: object::id(game),
                player: game.player,
                tile_index,
                bet_lost: game.bet_amount,
            });
        } else {
            // ---- 安全格！更新倍數 ----
            let safe_before = game.safe_remaining;
            game.safe_remaining = game.safe_remaining - 1;
            game.safe_revealed = game.safe_revealed + 1;

            // 倍數公式（每步同時扣除莊家優勢，複利衰減）：
            //   new_multiplier = old_multiplier × (tiles_before / safe_before) × (1 - house_edge)
            //
            // 每翻一格安全格，莊家各抽一次水（house_edge_bps / 10000）
            // 結算時直接用倍數，無需再額外扣除
            //
            // 以整數運算（u128 避免溢出）：
            //   new = old * tiles_before * (10000 - house_edge_bps) / safe_before / 10000
            let new_mult = (game.current_multiplier as u128)
                * (tiles_before as u128)
                * ((10000 - platform.house_edge_bps) as u128)
                / (safe_before as u128)
                / 10000u128;
            game.current_multiplier = new_mult as u64;

            // 潛在賠付：倍數已含莊家優勢，直接計算
            //   potential = bet × multiplier / SCALE
            let potential_payout = (game.bet_amount as u128)
                * (game.current_multiplier as u128)
                / (MULTIPLIER_SCALE as u128);

            event::emit(TileRevealed {
                game_id: object::id(game),
                player: game.player,
                tile_index,
                is_bomb: false,
                multiplier: game.current_multiplier,
                potential_payout: potential_payout as u64,
            });
        };
    }

    /// 收手：按當前倍數結算獎勵
    ///
    /// 消耗並刪除 GameSession 對象
    /// 押注從 bet_balance 退回，獲利從金庫支付
    ///
    /// 允許 0 次揭格即收手（相當於取消遊戲，退回押注）
    public fun cashout(
        platform: &mut GamePlatform,
        game: GameSession,
        player_balance: &mut PlayerBalance,
        lottery: &mut LotterySystem,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);

        let GameSession {
            id,
            player,
            bet_amount,
            bet_balance: mut bet_bal,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed,
            revealed_mask: _,
            current_multiplier,
            status: _,
            start_epoch: _,
            reserved_amount,
        } = game;

        // 計算應付金額：倍數已於每步翻格時扣除莊家優勢，直接結算
        //   payout = bet × multiplier / SCALE
        let raw_payout = ((bet_amount as u128)
            * (current_multiplier as u128)
            / (MULTIPLIER_SCALE as u128)) as u64;

        // 封頂：單局賠付不超過 max_single_payout
        let payout = if (raw_payout > platform.max_single_payout) {
            platform.max_single_payout
        } else {
            raw_payout
        };

        if (payout >= bet_amount) {
            // 玩家獲利：退回押注 + 從金庫支付利潤，莊家本局無收益，不注入獎池
            balance::join(&mut player_balance.balance, balance::split(&mut bet_bal, bet_amount));
            balance::destroy_zero(bet_bal);
            let profit = payout - bet_amount;
            if (profit > 0) {
                let winnings = balance::split(&mut platform.treasury, profit);
                balance::join(&mut player_balance.balance, winnings);
            };
        } else {
            // 莊家獲利：玩家得 payout，剩餘分配 5% 進 SUI 獎池、95% 進金庫
            balance::join(&mut player_balance.balance, balance::split(&mut bet_bal, payout));
            let house_profit = bet_amount - payout;
            let prize_cut = house_profit * PRIZE_POOL_BPS / 10000;
            if (prize_cut > 0) {
                let prize_balance = balance::split(&mut bet_bal, prize_cut);
                lottery::add_prize_sui(lottery, prize_balance);
            };
            let remaining = balance::value(&bet_bal);
            if (remaining > 0) {
                balance::join(&mut platform.treasury, balance::split(&mut bet_bal, remaining));
            };
            balance::destroy_zero(bet_bal);
        };

        // 釋放預留資金（使用開局時存儲的精確值）
        platform.reserved = platform.reserved - reserved_amount;

        // 發放彩票 NFT（每局完成皆發，無論輸贏）
        let ticket = lottery::issue_ticket(lottery, player, bet_amount, clock, ctx);
        transfer::public_transfer(ticket, player);

        let game_id = object::uid_to_inner(&id);
        event::emit(GameCashedOut {
            game_id,
            player,
            safe_revealed,
            payout,
        });

        object::delete(id);
    }

    /// 取消尚未翻格的遊戲（全額退款，不扣莊家優勢）
    ///
    /// 僅允許在 safe_revealed == 0 時呼叫（翻格後不可取消）
    /// 押注全額退回玩家帳戶，預留資金釋放
    public fun cancel_game(
        platform: &mut GamePlatform,
        game: GameSession,
        player_balance: &mut PlayerBalance,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);
        assert!(game.safe_revealed == 0, ECannotCancelAfterReveal);

        let GameSession {
            id,
            player,
            bet_amount,
            bet_balance,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed: _,
            revealed_mask: _,
            current_multiplier: _,
            status: _,
            start_epoch: _,
            reserved_amount,
        } = game;

        // 全額退回押注，不扣莊家優勢
        balance::join(&mut player_balance.balance, bet_balance);

        // 釋放預留資金
        platform.reserved = platform.reserved - reserved_amount;

        let game_id = object::uid_to_inner(&id);
        event::emit(GameCancelled {
            game_id,
            player,
            bet_amount,
            bet_refunded: bet_amount,
        });

        object::delete(id);
    }

    /// 清理已爆炸的遊戲會話（刪除對象，釋放鏈上儲存）
    public fun destroy_exploded_game(game: GameSession) {
        assert!(game.status == STATUS_EXPLODED, EGameStillActive);
        let GameSession {
            id,
            player: _,
            bet_amount: _,
            bet_balance,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed: _,
            revealed_mask: _,
            current_multiplier: _,
            status: _,
            start_epoch: _,
            reserved_amount: _,
        } = game;
        // 炸彈觸發後押注已全部轉出，reserved 也已在 reveal_tile 時釋放
        // bet_balance 此時必為零
        balance::destroy_zero(bet_balance);
        object::delete(id);
    }

    /// 強制結算超時遊戲會話
    ///
    /// 任何人均可呼叫（無需 AdminCap）
    /// 條件：遊戲為 STATUS_ACTIVE 且已超過 SESSION_EXPIRE_EPOCHS 個 epoch
    ///
    /// 效果：
    ///   - 玩家押注沒收，轉入金庫
    ///   - 預留資金釋放
    ///   - GameSession 對象刪除
    ///
    /// 設計意圖：防止玩家透過棄置大量遊戲會話來鎖死金庫資金
    public fun force_expire_game(
        platform: &mut GamePlatform,
        game: GameSession,
        ctx: &TxContext,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);
        assert!(
            ctx.epoch() >= game.start_epoch + SESSION_EXPIRE_EPOCHS,
            ESessionNotExpired
        );

        let GameSession {
            id,
            player,
            bet_amount: _,
            bet_balance,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed: _,
            revealed_mask: _,
            current_multiplier: _,
            status: _,
            start_epoch: _,
            reserved_amount,
        } = game;

        // 押注沒收進金庫
        let confiscated = balance::value(&bet_balance);
        balance::join(&mut platform.treasury, bet_balance);

        // 釋放預留資金
        platform.reserved = platform.reserved - reserved_amount;

        let game_id = object::uid_to_inner(&id);
        event::emit(GameExpired {
            game_id,
            player,
            bet_confiscated: confiscated,
            reserved_released: reserved_amount,
        });

        object::delete(id);
    }

    // === USDC 遊戲核心邏輯 ===

    /// 開始新的 USDC 遊戲會話
    public fun start_game_usdc(
        platform: &mut GamePlatform,
        player_balance: &mut PlayerBalanceUSDC,
        bet_amount: u64,
        ctx: &mut TxContext,
    ): GameSessionUSDC {
        assert!(!platform.paused, EPlatformPaused);
        assert!(bet_amount >= platform.min_bet_usdc, EBetTooSmall);
        assert!(bet_amount <= platform.max_bet_usdc, EBetTooLarge);
        assert!(bet_amount <= platform.max_single_payout_usdc, EBetExceedsSinglePayoutCap);
        assert!(balance::value(&player_balance.balance) >= bet_amount, EInsufficientBalance);

        let theoretical_net = (bet_amount as u128) * ((MAX_MULTIPLIER_WITH_EDGE - 1) as u128);
        let capped_net = (platform.max_single_payout_usdc as u128) - (bet_amount as u128);
        let reserved_amount = if (theoretical_net < capped_net) {
            theoretical_net as u64
        } else {
            capped_net as u64
        };

        let usdc_available =
            (balance::value(&platform.usdc_treasury) as u128) - (platform.usdc_reserved as u128);
        assert!(usdc_available >= (reserved_amount as u128), EInsufficientTreasury);

        platform.usdc_reserved = platform.usdc_reserved + reserved_amount;
        let bet_balance = balance::split(&mut player_balance.balance, bet_amount);

        let game = GameSessionUSDC {
            id: object::new(ctx),
            player: ctx.sender(),
            bet_amount,
            bet_balance,
            tiles_remaining: GRID_SIZE,
            bombs_remaining: BOMB_COUNT,
            safe_remaining: SAFE_COUNT,
            safe_revealed: 0,
            revealed_mask: 0,
            current_multiplier: MULTIPLIER_SCALE,
            status: STATUS_ACTIVE,
            start_epoch: ctx.epoch(),
            reserved_amount,
        };

        event::emit(GameStarted {
            game_id: object::id(&game),
            player: ctx.sender(),
            bet_amount,
        });

        game
    }

    /// 將 USDC GameSession 存回呼叫者
    public fun keep_game_usdc(game: GameSessionUSDC, ctx: &mut TxContext) {
        transfer::transfer(game, ctx.sender());
    }

    /// 揭開 USDC 遊戲的一個格子
    ///
    /// 邏輯與 SUI 版相同，炸彈爆炸時 5% 注入 USDC 獎池並發彩票
    entry fun reveal_tile_usdc(
        platform: &mut GamePlatform,
        game: &mut GameSessionUSDC,
        tile_index: u64,
        rand: &Random,
        lottery: &mut LotterySystem,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);
        assert!(tile_index < GRID_SIZE, EInvalidTile);
        assert!((game.revealed_mask >> (tile_index as u8)) & 1 == 0, ETileAlreadyRevealed);
        assert!(game.safe_remaining > 0, EAllSafeRevealed);

        game.revealed_mask = game.revealed_mask | (1u64 << (tile_index as u8));
        let tiles_before = game.tiles_remaining;
        game.tiles_remaining = game.tiles_remaining - 1;

        let mut gen = random::new_generator(rand, ctx);
        let roll = random::generate_u64_in_range(&mut gen, 0, tiles_before - 1);
        let is_bomb = roll < game.bombs_remaining;

        if (is_bomb) {
            game.bombs_remaining = game.bombs_remaining - 1;
            game.status = STATUS_EXPLODED;

            // 5% 注入 USDC 獎池，剩餘 95% 進金庫
            let bet_val = balance::value(&game.bet_balance);
            let prize_cut = bet_val * PRIZE_POOL_BPS / 10000;
            if (prize_cut > 0) {
                let prize_balance = balance::split(&mut game.bet_balance, prize_cut);
                lottery::add_prize_usdc(lottery, prize_balance);
            };
            let remaining = balance::value(&game.bet_balance);
            if (remaining > 0) {
                let lost = balance::split(&mut game.bet_balance, remaining);
                balance::join(&mut platform.usdc_treasury, lost);
            };

            platform.usdc_reserved = platform.usdc_reserved - game.reserved_amount;

            // 發放彩票
            let ticket = lottery::issue_ticket(lottery, game.player, game.bet_amount, clock, ctx);
            transfer::public_transfer(ticket, game.player);

            event::emit(TileRevealed {
                game_id: object::id(game),
                player: game.player,
                tile_index,
                is_bomb: true,
                multiplier: 0,
                potential_payout: 0,
            });
            event::emit(GameExploded {
                game_id: object::id(game),
                player: game.player,
                tile_index,
                bet_lost: game.bet_amount,
            });
        } else {
            let safe_before = game.safe_remaining;
            game.safe_remaining = game.safe_remaining - 1;
            game.safe_revealed = game.safe_revealed + 1;

            let new_mult = (game.current_multiplier as u128)
                * (tiles_before as u128)
                * ((10000 - platform.house_edge_bps) as u128)
                / (safe_before as u128)
                / 10000u128;
            game.current_multiplier = new_mult as u64;

            let potential_payout = (game.bet_amount as u128)
                * (game.current_multiplier as u128)
                / (MULTIPLIER_SCALE as u128);

            event::emit(TileRevealed {
                game_id: object::id(game),
                player: game.player,
                tile_index,
                is_bomb: false,
                multiplier: game.current_multiplier,
                potential_payout: potential_payout as u64,
            });
        };
    }

    /// USDC 收手：按當前倍數結算
    ///
    /// 莊家獲利部分 5% 注入 USDC 獎池，每局皆發彩票
    public fun cashout_usdc(
        platform: &mut GamePlatform,
        game: GameSessionUSDC,
        player_balance: &mut PlayerBalanceUSDC,
        lottery: &mut LotterySystem,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);

        let GameSessionUSDC {
            id,
            player,
            bet_amount,
            bet_balance: mut bet_bal,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed,
            revealed_mask: _,
            current_multiplier,
            status: _,
            start_epoch: _,
            reserved_amount,
        } = game;

        // 倍數已於每步翻格時扣除莊家優勢，直接結算
        let raw_payout = ((bet_amount as u128)
            * (current_multiplier as u128)
            / (MULTIPLIER_SCALE as u128)) as u64;

        // 封頂：使用 USDC 專屬賠付上限（修正：原為 max_single_payout，現改為 max_single_payout_usdc）
        let payout = if (raw_payout > platform.max_single_payout_usdc) {
            platform.max_single_payout_usdc
        } else {
            raw_payout
        };

        if (payout >= bet_amount) {
            // 玩家獲利：退回押注 + 從 USDC 金庫支付利潤，莊家本局無收益，不注入獎池
            balance::join(&mut player_balance.balance, balance::split(&mut bet_bal, bet_amount));
            balance::destroy_zero(bet_bal);
            let profit = payout - bet_amount;
            if (profit > 0) {
                let winnings = balance::split(&mut platform.usdc_treasury, profit);
                balance::join(&mut player_balance.balance, winnings);
            };
        } else {
            // 莊家獲利：玩家得 payout，剩餘 5% 進 USDC 獎池、95% 進金庫
            balance::join(&mut player_balance.balance, balance::split(&mut bet_bal, payout));
            let house_profit = bet_amount - payout;
            let prize_cut = house_profit * PRIZE_POOL_BPS / 10000;
            if (prize_cut > 0) {
                let prize_balance = balance::split(&mut bet_bal, prize_cut);
                lottery::add_prize_usdc(lottery, prize_balance);
            };
            let remaining = balance::value(&bet_bal);
            if (remaining > 0) {
                balance::join(&mut platform.usdc_treasury, balance::split(&mut bet_bal, remaining));
            };
            balance::destroy_zero(bet_bal);
        };

        platform.usdc_reserved = platform.usdc_reserved - reserved_amount;

        // 發放彩票
        let ticket = lottery::issue_ticket(lottery, player, bet_amount, clock, ctx);
        transfer::public_transfer(ticket, player);

        let game_id = object::uid_to_inner(&id);
        event::emit(GameCashedOut {
            game_id,
            player,
            safe_revealed,
            payout,
        });

        object::delete(id);
    }

    /// 取消尚未翻格的 USDC 遊戲（全額退款）
    public fun cancel_game_usdc(
        platform: &mut GamePlatform,
        game: GameSessionUSDC,
        player_balance: &mut PlayerBalanceUSDC,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);
        assert!(game.safe_revealed == 0, ECannotCancelAfterReveal);

        let GameSessionUSDC {
            id,
            player,
            bet_amount,
            bet_balance,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed: _,
            revealed_mask: _,
            current_multiplier: _,
            status: _,
            start_epoch: _,
            reserved_amount,
        } = game;

        balance::join(&mut player_balance.balance, bet_balance);
        platform.usdc_reserved = platform.usdc_reserved - reserved_amount;

        let game_id = object::uid_to_inner(&id);
        event::emit(GameCancelled {
            game_id,
            player,
            bet_amount,
            bet_refunded: bet_amount,
        });

        object::delete(id);
    }

    /// 清理已爆炸的 USDC 遊戲會話
    public fun destroy_exploded_game_usdc(game: GameSessionUSDC) {
        assert!(game.status == STATUS_EXPLODED, EGameStillActive);
        let GameSessionUSDC {
            id,
            player: _,
            bet_amount: _,
            bet_balance,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed: _,
            revealed_mask: _,
            current_multiplier: _,
            status: _,
            start_epoch: _,
            reserved_amount: _,
        } = game;
        balance::destroy_zero(bet_balance);
        object::delete(id);
    }

    /// 強制結算超時的 USDC 遊戲會話
    public fun force_expire_game_usdc(
        platform: &mut GamePlatform,
        game: GameSessionUSDC,
        ctx: &TxContext,
    ) {
        assert!(game.status == STATUS_ACTIVE, EGameNotActive);
        assert!(
            ctx.epoch() >= game.start_epoch + SESSION_EXPIRE_EPOCHS,
            ESessionNotExpired
        );

        let GameSessionUSDC {
            id,
            player,
            bet_amount: _,
            bet_balance,
            tiles_remaining: _,
            bombs_remaining: _,
            safe_remaining: _,
            safe_revealed: _,
            revealed_mask: _,
            current_multiplier: _,
            status: _,
            start_epoch: _,
            reserved_amount,
        } = game;

        let confiscated = balance::value(&bet_balance);
        balance::join(&mut platform.usdc_treasury, bet_balance);
        platform.usdc_reserved = platform.usdc_reserved - reserved_amount;

        let game_id = object::uid_to_inner(&id);
        event::emit(GameExpired {
            game_id,
            player,
            bet_confiscated: confiscated,
            reserved_released: reserved_amount,
        });

        object::delete(id);
    }

    // === 管理員功能 ===

    /// 注入流動性到平台金庫
    public fun add_liquidity(
        _: &AdminCap,
        platform: &mut GamePlatform,
        coin: Coin<TSUI>,
    ) {
        balance::join(&mut platform.treasury, coin::into_balance(coin));
    }

    /// 從金庫提取未預留資金
    /// 只能提取未被遊戲佔用的閒置資金
    public fun remove_liquidity(
        _: &AdminCap,
        platform: &mut GamePlatform,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<TSUI> {
        let available = balance::value(&platform.treasury) - platform.reserved;
        assert!(amount <= available, EInsufficientBalance);
        let withdrawn = balance::split(&mut platform.treasury, amount);
        coin::from_balance(withdrawn, ctx)
    }

    /// 設定莊家優勢（上限 10%）
    public fun set_house_edge(
        _: &AdminCap,
        platform: &mut GamePlatform,
        house_edge_bps: u64,
    ) {
        assert!(house_edge_bps <= MAX_HOUSE_EDGE_BPS, EHouseEdgeTooHigh);
        platform.house_edge_bps = house_edge_bps;
    }

    /// 設定 SUI 押注上下限
    public fun set_bet_limits(
        _: &AdminCap,
        platform: &mut GamePlatform,
        min_bet: u64,
        max_bet: u64,
    ) {
        assert!(min_bet > 0 && min_bet <= max_bet, EInvalidBetLimits);
        platform.min_bet = min_bet;
        platform.max_bet = max_bet;
    }

    /// 設定 USDC 最低押注下限（獨立欄位，不影響 SUI）
    public fun set_min_bet_usdc(
        _: &AdminCap,
        platform: &mut GamePlatform,
        min_bet_usdc: u64,
    ) {
        assert!(min_bet_usdc > 0 && min_bet_usdc <= platform.max_bet_usdc, EInvalidBetLimits);
        platform.min_bet_usdc = min_bet_usdc;
    }

    /// 設定 USDC 最高押注上限（獨立欄位，不影響 SUI）
    public fun set_max_bet_usdc(
        _: &AdminCap,
        platform: &mut GamePlatform,
        max_bet_usdc: u64,
    ) {
        assert!(max_bet_usdc > 0 && max_bet_usdc <= platform.max_single_payout_usdc, EInvalidBetLimits);
        platform.max_bet_usdc = max_bet_usdc;
    }

    /// 暫停/恢復平台
    public fun set_paused(
        _: &AdminCap,
        platform: &mut GamePlatform,
        paused: bool,
    ) {
        platform.paused = paused;
    }

    /// 設定單局最大賠付上限
    /// 必須大於 max_bet，否則玩家即使押最大注也無法贏回押注
    public fun set_max_single_payout(
        _: &AdminCap,
        platform: &mut GamePlatform,
        max_single_payout: u64,
    ) {
        assert!(max_single_payout > platform.max_bet, EInvalidPayoutCap);
        platform.max_single_payout = max_single_payout;
    }

    /// 設定 USDC 單局最大賠付上限
    /// 必須大於 max_bet，以確保任何合法押注都能開局
    public fun set_max_single_payout_usdc(
        _: &AdminCap,
        platform: &mut GamePlatform,
        max_single_payout_usdc: u64,
    ) {
        assert!(max_single_payout_usdc > platform.max_bet, EInvalidPayoutCap);
        platform.max_single_payout_usdc = max_single_payout_usdc;
    }

    /// 注入 USDC 流動性到平台金庫
    public fun add_liquidity_usdc(
        _: &AdminCap,
        platform: &mut GamePlatform,
        coin: Coin<USDC>,
    ) {
        balance::join(&mut platform.usdc_treasury, coin::into_balance(coin));
    }

    /// 從 USDC 金庫提取未預留資金
    public fun remove_liquidity_usdc(
        _: &AdminCap,
        platform: &mut GamePlatform,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<USDC> {
        let available = balance::value(&platform.usdc_treasury) - platform.usdc_reserved;
        assert!(amount <= available, EInsufficientBalance);
        coin::from_balance(balance::split(&mut platform.usdc_treasury, amount), ctx)
    }

    // === 查詢函數（view） ===

    /// 查詢玩家存款餘額
    public fun player_balance_value(pb: &PlayerBalance): u64 {
        balance::value(&pb.balance)
    }

    /// 計算若此刻收手可獲得的金額（含 5% 莊家優勢折扣）
    /// 注意：此函式無法讀取 platform 的 house_edge_bps，故使用固定常數 500 bps
    /// 若需精確值，請在前端以 TileRevealed 事件的 potential_payout 欄位為準
    public fun get_potential_payout(game: &GameSession): u64 {
        if (game.status != STATUS_ACTIVE) return 0;
        ((game.bet_amount as u128)
            * (game.current_multiplier as u128)
            * 9500u128
            / (MULTIPLIER_SCALE as u128)
            / 10000u128) as u64
    }

    /// 查詢當前倍數（原始精度值，需除以 MULTIPLIER_SCALE 得到倍數）
    public fun get_multiplier(game: &GameSession): u64 {
        game.current_multiplier
    }

    /// 查詢遊戲狀態
    public fun get_game_status(game: &GameSession): u8 {
        game.status
    }

    /// 查詢已揭開的安全格數量
    public fun get_safe_revealed(game: &GameSession): u64 {
        game.safe_revealed
    }

    /// 查詢金庫總餘額
    public fun treasury_balance(platform: &GamePlatform): u64 {
        balance::value(&platform.treasury)
    }

    /// 查詢金庫中可用（未預留）餘額
    public fun treasury_available(platform: &GamePlatform): u64 {
        balance::value(&platform.treasury) - platform.reserved
    }

    /// 查詢平台是否暫停
    public fun is_paused(platform: &GamePlatform): bool {
        platform.paused
    }

    /// 查詢莊家優勢
    public fun house_edge_bps(platform: &GamePlatform): u64 {
        platform.house_edge_bps
    }

    /// 查詢 SUI 最低押注
    public fun min_bet(platform: &GamePlatform): u64 {
        platform.min_bet
    }

    /// 查詢 USDC 最低押注
    public fun min_bet_usdc(platform: &GamePlatform): u64 {
        platform.min_bet_usdc
    }

    /// 查詢 SUI 最高押注
    public fun max_bet(platform: &GamePlatform): u64 {
        platform.max_bet
    }

    /// 查詢 USDC 最高押注
    public fun max_bet_usdc(platform: &GamePlatform): u64 {
        platform.max_bet_usdc
    }

    /// 查詢單局最大賠付上限
    public fun max_single_payout(platform: &GamePlatform): u64 {
        platform.max_single_payout
    }

    /// 查詢遊戲開局 epoch
    public fun get_session_start_epoch(game: &GameSession): u64 {
        game.start_epoch
    }

    /// 查詢本局預留金額
    public fun get_reserved_amount(game: &GameSession): u64 {
        game.reserved_amount
    }

    /// 查詢超時門檻（start_epoch + SESSION_EXPIRE_EPOCHS）
    public fun get_session_expire_epoch(game: &GameSession): u64 {
        game.start_epoch + SESSION_EXPIRE_EPOCHS
    }

    /// 查詢 USDC 金庫總餘額
    public fun usdc_treasury_balance(platform: &GamePlatform): u64 {
        balance::value(&platform.usdc_treasury)
    }

    /// 查詢 USDC 金庫可用（未預留）餘額
    public fun usdc_treasury_available(platform: &GamePlatform): u64 {
        balance::value(&platform.usdc_treasury) - platform.usdc_reserved
    }

    /// 查詢 USDC 玩家帳戶餘額
    public fun player_usdc_balance_value(pb: &PlayerBalanceUSDC): u64 {
        balance::value(&pb.balance)
    }

    /// 查詢 USDC 遊戲狀態
    public fun get_usdc_game_status(game: &GameSessionUSDC): u8 {
        game.status
    }

    /// 查詢 USDC 遊戲當前倍數
    public fun get_usdc_multiplier(game: &GameSessionUSDC): u64 {
        game.current_multiplier
    }

    /// 計算 USDC 遊戲若此刻收手可獲得的金額
    public fun get_usdc_potential_payout(game: &GameSessionUSDC): u64 {
        if (game.status != STATUS_ACTIVE) return 0;
        ((game.bet_amount as u128)
            * (game.current_multiplier as u128)
            * 9500u128
            / (MULTIPLIER_SCALE as u128)
            / 10000u128) as u64
    }

    /// 查詢 USDC 遊戲開局 epoch
    public fun get_usdc_session_start_epoch(game: &GameSessionUSDC): u64 {
        game.start_epoch
    }
}

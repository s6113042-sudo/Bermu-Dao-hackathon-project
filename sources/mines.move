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
    use sui::sui::SUI;
    use sui::random::{Self, Random};
    use sui::event;

    // === 常數 ===

    /// 格子總數
    const GRID_SIZE: u64 = 16;
    /// 炸彈數量
    const BOMB_COUNT: u64 = 5;
    /// 安全格數量
    const SAFE_COUNT: u64 = 11;

    /// 倍數精度：MULTIPLIER_SCALE 代表 1.0x
    const MULTIPLIER_SCALE: u64 = 1_000_000_000;

    /// 理論最大倍數（無莊家優勢，全部安全格揭完）
    /// = C(16,5) = 4368x
    /// 最大淨賠付 = bet * (4368 - 1) = bet * 4367
    const MAX_MULTIPLIER: u64 = 4368;

    /// 莊家優勢上限：1000 bps = 10%
    const MAX_HOUSE_EDGE_BPS: u64 = 1000;

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

    // === 結構體 ===

    /// 遊戲平台（共享對象）
    /// 持有金庫資金、準備金追蹤、及平台配置
    public struct GamePlatform has key {
        id: UID,
        /// 平台金庫，用於支付玩家獲勝賠付
        treasury: Balance<SUI>,
        /// 當前所有進行中遊戲的最大潛在淨賠付總和（已預留）
        reserved: u64,
        /// 莊家優勢（basis points，例如 300 = 3%）
        house_edge_bps: u64,
        /// 最低押注（MIST 單位，1 SUI = 1_000_000_000 MIST）
        min_bet: u64,
        /// 最高押注（MIST 單位）
        max_bet: u64,
        /// 管理員地址
        admin: address,
        /// 是否暫停
        paused: bool,
    }

    /// 管理員憑證（擁有對象）
    public struct AdminCap has key, store {
        id: UID,
    }

    /// 玩家存款餘額（玩家擁有對象）
    /// 玩家預先存入 SUI，之後遊玩不需每次轉帳授權
    public struct PlayerBalance has key {
        id: UID,
        balance: Balance<SUI>,
    }

    /// 單局遊戲會話（玩家擁有對象）
    public struct GameSession has key {
        id: UID,
        /// 玩家地址
        player: address,
        /// 押注金額
        bet_amount: u64,
        /// 實際存放押注的餘額（遊戲結束時轉出）
        bet_balance: Balance<SUI>,
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

    // === 初始化 ===

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap { id: object::new(ctx) };
        let platform = GamePlatform {
            id: object::new(ctx),
            treasury: balance::zero(),
            reserved: 0,
            house_edge_bps: 300,          // 預設 3% 莊家優勢
            min_bet: 1_000_000,           // 最低 0.001 SUI
            max_bet: 10_000_000_000,      // 最高 10 SUI
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
        payment: Coin<SUI>,
    ) {
        balance::join(&mut player_balance.balance, coin::into_balance(payment));
    }

    /// 從玩家帳戶提取指定金額
    public fun withdraw(
        player_balance: &mut PlayerBalance,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> { // 1. 這裡加入回傳型別
        assert!(balance::value(&player_balance.balance) >= amount, EInsufficientBalance);
        let withdrawn = balance::split(&mut player_balance.balance, amount);
    
        // 2. 直接回傳 Coin 物件，不要調用 transfer
        coin::from_balance(withdrawn, ctx)
    }

    /// 提取玩家帳戶全部餘額
    public fun withdraw_all(
        player_balance: &mut PlayerBalance,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        let amount = balance::value(&player_balance.balance);
        assert!(amount > 0, EInsufficientBalance);
        let withdrawn = balance::split(&mut player_balance.balance, amount);
        coin::from_balance(withdrawn, ctx)
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
        assert!(balance::value(&player_balance.balance) >= bet_amount, EInsufficientBalance);

        // 計算本局理論最大淨賠付（超出押注的部分）
        // 最大倍數 = 4368x，最大淨賠 = bet * 4367
        // 使用 u128 避免溢出
        let max_net_payout = (bet_amount as u128) * ((MAX_MULTIPLIER - 1) as u128);
        let treasury_available =
            (balance::value(&platform.treasury) as u128) - (platform.reserved as u128);
        assert!(treasury_available >= max_net_payout, EInsufficientTreasury);

        // 預留本局最大賠付至 reserved
        platform.reserved = platform.reserved + (max_net_payout as u64);

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
    /// 注意：此函數為 public 以支援 PTB 組合調用。
    /// Sui 的 Random 物件由驗證者共識更新，用戶在交易提交前無法預知隨機結果。
    /// 交易一旦上鏈即不可撤銷，因此不存在「選擇性提交」的攻擊面。
    #[allow(lint(public_random))]
    public fun reveal_tile(
        platform: &mut GamePlatform,
        game: &mut GameSession,
        tile_index: u64,
        rand: &Random,
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

            // 全部押注轉入金庫
            let bet_amount = balance::value(&game.bet_balance);
            let lost = balance::split(&mut game.bet_balance, bet_amount);
            balance::join(&mut platform.treasury, lost);

            // 釋放預留資金
            let max_net = (game.bet_amount as u128) * ((MAX_MULTIPLIER - 1) as u128);
            platform.reserved = platform.reserved - (max_net as u64);

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

            // 倍數公式（每步）：
            //   new_multiplier = old_multiplier
            //                  × (tiles_before / safe_before)   ← 公平期望值倒數
            //                  × (1 - house_edge)               ← 莊家優勢折扣
            //
            // 以整數運算（u128 避免溢出）：
            //   new = old * tiles_before * (10000 - house_edge_bps) / safe_before / 10000
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
        } = game;

        // 計算應付金額：bet * multiplier / SCALE
        let payout = ((bet_amount as u128)
            * (current_multiplier as u128)
            / (MULTIPLIER_SCALE as u128)) as u64;

        if (payout >= bet_amount) {
            // 正常情況：退回押注 + 從金庫支付利潤
            balance::join(&mut player_balance.balance, balance::split(&mut bet_bal, bet_amount));
            balance::destroy_zero(bet_bal);

            let profit = payout - bet_amount;
            if (profit > 0) {
                let winnings = balance::split(&mut platform.treasury, profit);
                balance::join(&mut player_balance.balance, winnings);
            };
        } else {
            // 邊緣情況：倍數 < 1.0x（極高莊家優勢時）
            // 玩家獲得 payout，剩餘押注進入金庫
            balance::join(&mut player_balance.balance, balance::split(&mut bet_bal, payout));
            let to_treasury = balance::split(&mut bet_bal, bet_amount - payout);
            balance::join(&mut platform.treasury, to_treasury);
            balance::destroy_zero(bet_bal);
        };

        // 釋放預留資金
        let max_net = (bet_amount as u128) * ((MAX_MULTIPLIER - 1) as u128);
        platform.reserved = platform.reserved - (max_net as u64);

        let game_id = object::uid_to_inner(&id);
        event::emit(GameCashedOut {
            game_id,
            player,
            safe_revealed,
            payout,
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
        } = game;
        // 炸彈觸發後押注已全部轉出，bet_balance 應為零
        balance::destroy_zero(bet_balance);
        object::delete(id);
    }

    // === 管理員功能 ===

    /// 注入流動性到平台金庫
    public fun add_liquidity(
        _: &AdminCap,
        platform: &mut GamePlatform,
        coin: Coin<SUI>,
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
    ): Coin<SUI> {
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

    /// 設定押注上下限
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

    /// 暫停/恢復平台
    public fun set_paused(
        _: &AdminCap,
        platform: &mut GamePlatform,
        paused: bool,
    ) {
        platform.paused = paused;
    }

    // === 查詢函數（view） ===

    /// 查詢玩家存款餘額
    public fun player_balance_value(pb: &PlayerBalance): u64 {
        balance::value(&pb.balance)
    }

    /// 計算若此刻收手可獲得的金額
    public fun get_potential_payout(game: &GameSession): u64 {
        if (game.status != STATUS_ACTIVE) return 0;
        ((game.bet_amount as u128)
            * (game.current_multiplier as u128)
            / (MULTIPLIER_SCALE as u128)) as u64
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

    /// 查詢最低押注
    public fun min_bet(platform: &GamePlatform): u64 {
        platform.min_bet
    }

    /// 查詢最高押注
    public fun max_bet(platform: &GamePlatform): u64 {
        platform.max_bet
    }
}

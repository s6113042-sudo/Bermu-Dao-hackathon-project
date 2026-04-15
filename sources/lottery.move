/// 抽獎系統
///
/// 架構概覽：
///   - LotterySystem（共享對象）：持有獎池、輪次狀態、prizes table
///   - LotteryTicket（玩家擁有 NFT）：遊戲結束時自動發放，作為抽獎憑證
///
/// 抽獎規則：
///   - 每 20 分鐘開獎一次，任何人都可觸發（無需 Admin）
///   - 玩家完成一局遊戲（炸彈爆炸或收手）自動取得一張彩票
///   - 每輪獎金物理分離存入 prizes table，中獎者隨時可領，不受後續開獎影響
///   - 未中獎彩票於開獎後自動失效，可由玩家自行刪除
///
/// 獎池來源：
///   - 每局遊戲結束，平台從莊家利潤中抽取 5% 注入對應獎池
///   - SUI 遊戲利潤 → SUI 獎池；USDC 遊戲利潤 → USDC 獎池
module gamefi::lottery {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::random::{Self, Random};
    use sui::event;
    use sui::table::{Self, Table};
    use gamefi::tsui::TSUI;
    use gamefi::usdc::USDC;

    // === 常數 ===

    /// 開獎間隔：20 分鐘（毫秒）
    const LOTTERY_INTERVAL_MS: u64 = 20 * 60 * 1_000;

    // 錯誤碼
    const ELotteryNotReady: u64 = 200;
    const EWrongRound: u64 = 201;
    const EWrongWinner: u64 = 202;
    const ETicketTooLate: u64 = 203;
    const ENoPrize: u64 = 204;

    // === 結構體 ===

    /// 每輪獎金記錄（物理分離，永久保留直到中獎者領取）
    public struct RoundPrize has store {
        /// 該輪中獎票號
        winner_ticket: u64,
        /// 開獎時間（毫秒，用於驗證彩票有效性）
        draw_ms: u64,
        /// 實際鎖定的 SUI 獎金
        sui: Balance<TSUI>,
        /// 實際鎖定的 USDC 獎金
        usdc: Balance<USDC>,
    }

    /// 抽獎系統（共享對象）
    public struct LotterySystem has key {
        id: UID,
        /// 當前輪次（從 1 開始，每次開獎 +1）
        round: u64,
        /// 本輪已發出的彩票數量
        ticket_count: u64,
        /// 上次開獎時間（毫秒時間戳）
        last_draw_ms: u64,
        /// 最新一輪中獎票號（顯示用）
        winner_ticket: u64,
        /// 最新一輪待領 SUI 獎金快照（顯示用）
        pending_prize_sui: u64,
        /// 最新一輪待領 USDC 獎金快照（顯示用）
        pending_prize_usdc: u64,
        /// 持續累積的獎池（每局注入，開獎時移入 prizes）
        prize_pool_sui: Balance<TSUI>,
        /// 持續累積的 USDC 獎池
        prize_pool_usdc: Balance<USDC>,
        /// 各輪物理分離的獎金（round -> RoundPrize），中獎者隨時可領
        prizes: Table<u64, RoundPrize>,
    }

    /// 彩票 NFT（玩家擁有對象）
    /// 遊戲結束時自動發放到玩家錢包，無需額外操作
    public struct LotteryTicket has key, store {
        id: UID,
        /// 持有者地址
        player: address,
        /// 彩票號碼（本輪流水號，從 1 開始）
        ticket_number: u64,
        /// 所屬輪次
        round: u64,
        /// 押注金額（記錄用）
        bet_amount: u64,
        /// 發票時間（必須早於開獎時間才有效）
        issued_at_ms: u64,
    }

    // === 事件 ===

    public struct LotteryDrawn has copy, drop {
        round: u64,
        winner_ticket: u64,
        prize_sui: u64,
        prize_usdc: u64,
        draw_time_ms: u64,
    }

    public struct PrizeClaimed has copy, drop {
        round: u64,
        winner: address,
        prize_sui: u64,
        prize_usdc: u64,
    }

    // === 初始化 ===

    fun init(ctx: &mut TxContext) {
        let lottery = LotterySystem {
            id: object::new(ctx),
            round: 1,
            ticket_count: 0,
            last_draw_ms: 0,
            winner_ticket: 0,
            pending_prize_sui: 0,
            pending_prize_usdc: 0,
            prize_pool_sui: balance::zero(),
            prize_pool_usdc: balance::zero(),
            prizes: table::new(ctx),
        };
        transfer::share_object(lottery);
    }

    // === Package 內部函式（僅 mines.move 可呼叫）===

    /// 發放彩票給玩家（遊戲結束時由 mines.move 呼叫）
    public(package) fun issue_ticket(
        lottery: &mut LotterySystem,
        player: address,
        bet_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): LotteryTicket {
        lottery.ticket_count = lottery.ticket_count + 1;
        LotteryTicket {
            id: object::new(ctx),
            player,
            ticket_number: lottery.ticket_count,
            round: lottery.round,
            bet_amount,
            issued_at_ms: clock::timestamp_ms(clock),
        }
    }

    /// 注入 SUI 到獎池（mines.move 在 SUI 遊戲獲利時呼叫）
    public(package) fun add_prize_sui(
        lottery: &mut LotterySystem,
        funds: Balance<TSUI>,
    ) {
        balance::join(&mut lottery.prize_pool_sui, funds);
    }

    /// 注入 USDC 到獎池（mines.move 在 USDC 遊戲獲利時呼叫）
    public(package) fun add_prize_usdc(
        lottery: &mut LotterySystem,
        funds: Balance<USDC>,
    ) {
        balance::join(&mut lottery.prize_pool_usdc, funds);
    }

    // === 公開函式 ===

    /// 觸發開獎（任何人都可呼叫，20 分鐘後才允許）
    ///
    /// 流程：
    ///   1. 確認距上次開獎已超過 20 分鐘
    ///   2. 隨機從本輪彩票中抽出中獎號碼
    ///   3. 將本輪獎池物理移入 prizes table（與累積獎池分離）
    ///   4. 輪次 +1，重置彩票計數器，進入下一輪
    ///
    /// 注意：若上輪中獎者尚未領獎，其獎金已物理分離在 prizes table，
    ///       不受本次開獎影響，中獎者仍可隨時領取。
    #[allow(lint(public_random))]
    public fun trigger_lottery(
        lottery: &mut LotterySystem,
        random: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(now >= lottery.last_draw_ms + LOTTERY_INTERVAL_MS, ELotteryNotReady);

        let prize_sui = balance::value(&lottery.prize_pool_sui);
        let prize_usdc = balance::value(&lottery.prize_pool_usdc);

        // 有彩票才抽獎，否則獎金繼續累滾到下一輪
        if (lottery.ticket_count > 0) {
            let mut gen = random::new_generator(random, ctx);
            let winner = gen.generate_u64_in_range(1, lottery.ticket_count);

            lottery.winner_ticket = winner;
            lottery.pending_prize_sui = prize_sui;
            lottery.pending_prize_usdc = prize_usdc;

            // 物理分離獎金至 prizes table：開獎後新注入的資金不影響本輪獎金
            let sui = balance::withdraw_all(&mut lottery.prize_pool_sui);
            let usdc = balance::withdraw_all(&mut lottery.prize_pool_usdc);
            table::add(&mut lottery.prizes, lottery.round, RoundPrize {
                winner_ticket: winner,
                draw_ms: now,
                sui,
                usdc,
            });
        };

        lottery.last_draw_ms = now;

        event::emit(LotteryDrawn {
            round: lottery.round,
            winner_ticket: lottery.winner_ticket,
            prize_sui,
            prize_usdc,
            draw_time_ms: now,
        });

        // 進入下一輪
        lottery.round = lottery.round + 1;
        lottery.ticket_count = 0;
    }

    /// 領取獎金（回傳 Coin，由呼叫方 PTB 存入 PlayerBalance）
    ///
    /// 驗證：
    ///   - prizes table 中存在該輪次的獎金
    ///   - 彩票發放時間早於開獎時間（防止開獎後偽造）
    ///   - 彩票號碼與中獎號碼一致
    ///
    /// 中獎者可在任意時間點領取，不受後續開獎影響。
    /// 回傳：(Coin<TSUI>, Coin<USDC>) 供 PTB 串接 deposit_prize_*
    public fun claim_prize(
        lottery: &mut LotterySystem,
        ticket: LotteryTicket,
        ctx: &mut TxContext,
    ) : (Coin<TSUI>, Coin<USDC>) {
        // 確認該輪次有待領獎金
        assert!(table::contains(&lottery.prizes, ticket.round), ENoPrize);

        let prize_ref = table::borrow(&lottery.prizes, ticket.round);
        assert!(ticket.issued_at_ms < prize_ref.draw_ms, ETicketTooLate);
        assert!(ticket.ticket_number == prize_ref.winner_ticket, EWrongWinner);

        let winner = ticket.player;

        // 從 table 取出並銷毀該輪記錄
        let RoundPrize { winner_ticket: _, draw_ms: _, sui, usdc } =
            table::remove(&mut lottery.prizes, ticket.round);

        let claimed_sui  = balance::value(&sui);
        let claimed_usdc = balance::value(&usdc);

        let sui_coin  = coin::from_balance(sui, ctx);
        let usdc_coin = coin::from_balance(usdc, ctx);

        // 若領取的是最新一輪，清除顯示欄位
        if (ticket.round + 1 == lottery.round) {
            lottery.pending_prize_sui  = 0;
            lottery.pending_prize_usdc = 0;
        };

        event::emit(PrizeClaimed {
            round: ticket.round,
            winner,
            prize_sui: claimed_sui,
            prize_usdc: claimed_usdc,
        });

        let LotteryTicket {
            id, player: _, ticket_number: _, round: _, bet_amount: _, issued_at_ms: _
        } = ticket;
        object::delete(id);

        (sui_coin, usdc_coin)
    }

    /// 刪除過期彩票（非中獎彩票，玩家可主動清理以回收儲存押金）
    public fun discard_ticket(ticket: LotteryTicket, lottery: &LotterySystem) {
        assert!(ticket.round < lottery.round, EWrongRound);
        let LotteryTicket {
            id, player: _, ticket_number: _, round: _, bet_amount: _, issued_at_ms: _
        } = ticket;
        object::delete(id);
    }

    // === 查詢函式（view）===

    public fun prize_pool_sui(lottery: &LotterySystem): u64 {
        balance::value(&lottery.prize_pool_sui)
    }

    public fun prize_pool_usdc(lottery: &LotterySystem): u64 {
        balance::value(&lottery.prize_pool_usdc)
    }

    public fun current_round(lottery: &LotterySystem): u64 {
        lottery.round
    }

    public fun last_draw_ms(lottery: &LotterySystem): u64 {
        lottery.last_draw_ms
    }

    public fun next_draw_ms(lottery: &LotterySystem): u64 {
        lottery.last_draw_ms + LOTTERY_INTERVAL_MS
    }

    public fun winner_ticket(lottery: &LotterySystem): u64 {
        lottery.winner_ticket
    }

    public fun pending_prize_sui(lottery: &LotterySystem): u64 {
        lottery.pending_prize_sui
    }

    public fun pending_prize_usdc(lottery: &LotterySystem): u64 {
        lottery.pending_prize_usdc
    }

    public fun ticket_count(lottery: &LotterySystem): u64 {
        lottery.ticket_count
    }

    public fun ticket_info(ticket: &LotteryTicket): (u64, u64, u64, u64) {
        (ticket.ticket_number, ticket.round, ticket.bet_amount, ticket.issued_at_ms)
    }
}

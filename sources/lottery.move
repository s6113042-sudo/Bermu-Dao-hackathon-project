/// 抽獎系統
///
/// 架構概覽：
///   - LotterySystem（共享對象）：持有獎池、輪次狀態、開獎記錄
///   - LotteryTicket（玩家擁有 NFT）：遊戲結束時自動發放，作為抽獎憑證
///
/// 抽獎規則：
///   - 每 20 分鐘開獎一次，任何人都可觸發（無需 Admin）
///   - 玩家完成一局遊戲（炸彈爆炸或收手）自動取得一張彩票
///   - 中獎者一鍵領取當輪全部獎池（SUI + USDC 雙獎池）
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

    /// 抽獎系統（共享對象）
    public struct LotterySystem has key {
        id: UID,
        /// 當前輪次（從 1 開始，每次開獎 +1）
        round: u64,
        /// 本輪已發出的彩票數量
        ticket_count: u64,
        /// 上次開獎時間（毫秒時間戳）
        last_draw_ms: u64,
        /// 本輪中獎票號（開獎後設定）
        winner_ticket: u64,
        /// 上輪快照：待領 SUI 獎金（開獎時鎖定，避免新注入影響已結算金額）
        pending_prize_sui: u64,
        /// 上輪快照：待領 USDC 獎金
        pending_prize_usdc: u64,
        /// SUI 獎池餘額
        prize_pool_sui: Balance<TSUI>,
        /// USDC 獎池餘額
        prize_pool_usdc: Balance<USDC>,
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
    ///   2. 快照當前獎池金額（鎖定本輪獎金）
    ///   3. 隨機從本輪彩票中抽出中獎號碼
    ///   4. 輪次 +1，重置彩票計數器，進入下一輪
    #[allow(lint(public_random))]
    public fun trigger_lottery(
        lottery: &mut LotterySystem,
        random: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(now >= lottery.last_draw_ms + LOTTERY_INTERVAL_MS, ELotteryNotReady);

        // 快照本輪獎池金額（開獎後新注入的資金計入下一輪）
        let prize_sui = balance::value(&lottery.prize_pool_sui);
        let prize_usdc = balance::value(&lottery.prize_pool_usdc);

        // 有彩票才抽獎，否則獎金累滾到下一輪
        if (lottery.ticket_count > 0) {
            let mut gen = random::new_generator(random, ctx);
            lottery.winner_ticket = gen.generate_u64_in_range(1, lottery.ticket_count);
            lottery.pending_prize_sui = prize_sui;
            lottery.pending_prize_usdc = prize_usdc;
        };
        // ticket_count == 0 時：winner_ticket 保持 0，pending 保持 0，獎金自然累滾

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
    ///   - 彩票屬於上一輪（round == current_round - 1）
    ///   - 彩票發放時間早於開獎時間（防止開獎後偽造）
    ///   - 彩票號碼與中獎號碼一致
    ///
    /// 回傳：(Coin<TSUI>, Coin<USDC>) 供 PTB 串接 deposit_prize_*
    public fun claim_prize(
        lottery: &mut LotterySystem,
        ticket: LotteryTicket,
        ctx: &mut TxContext,
    ) : (Coin<TSUI>, Coin<USDC>) {
        assert!(lottery.pending_prize_sui > 0 || lottery.pending_prize_usdc > 0, ENoPrize);
        assert!(ticket.round == lottery.round - 1, EWrongRound);
        assert!(ticket.issued_at_ms < lottery.last_draw_ms, ETicketTooLate);
        assert!(ticket.ticket_number == lottery.winner_ticket, EWrongWinner);

        let winner = ticket.player;

        let claimed_sui  = lottery.pending_prize_sui;
        let claimed_usdc = lottery.pending_prize_usdc;

        // 取出 SUI 獎金（無獎金時回傳零幣）
        let sui_coin = if (claimed_sui > 0) {
            lottery.pending_prize_sui = 0;
            coin::from_balance(balance::split(&mut lottery.prize_pool_sui, claimed_sui), ctx)
        } else {
            coin::zero(ctx)
        };

        // 取出 USDC 獎金
        let usdc_coin = if (claimed_usdc > 0) {
            lottery.pending_prize_usdc = 0;
            coin::from_balance(balance::split(&mut lottery.prize_pool_usdc, claimed_usdc), ctx)
        } else {
            coin::zero(ctx)
        };

        event::emit(PrizeClaimed {
            round: lottery.round - 1,
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
        // 只能刪除非當前輪次的彩票（確保當輪彩票不被誤刪）
        assert!(ticket.round < lottery.round, EWrongRound);
        let LotteryTicket {
            id, player: _, ticket_number: _, round: _, bet_amount: _, issued_at_ms: _
        } = ticket;
        object::delete(id);
    }

    // === 查詢函式（view）===

    /// 查詢 SUI 獎池餘額
    public fun prize_pool_sui(lottery: &LotterySystem): u64 {
        balance::value(&lottery.prize_pool_sui)
    }

    /// 查詢 USDC 獎池餘額
    public fun prize_pool_usdc(lottery: &LotterySystem): u64 {
        balance::value(&lottery.prize_pool_usdc)
    }

    /// 查詢當前輪次
    public fun current_round(lottery: &LotterySystem): u64 {
        lottery.round
    }

    /// 查詢上次開獎時間（ms）
    public fun last_draw_ms(lottery: &LotterySystem): u64 {
        lottery.last_draw_ms
    }

    /// 查詢下次可開獎時間（ms）
    public fun next_draw_ms(lottery: &LotterySystem): u64 {
        lottery.last_draw_ms + LOTTERY_INTERVAL_MS
    }

    /// 查詢上輪中獎票號
    public fun winner_ticket(lottery: &LotterySystem): u64 {
        lottery.winner_ticket
    }

    /// 查詢上輪待領 SUI 獎金（0 表示已領或本輪無彩票）
    public fun pending_prize_sui(lottery: &LotterySystem): u64 {
        lottery.pending_prize_sui
    }

    /// 查詢上輪待領 USDC 獎金
    public fun pending_prize_usdc(lottery: &LotterySystem): u64 {
        lottery.pending_prize_usdc
    }

    /// 查詢本輪已發出彩票數
    public fun ticket_count(lottery: &LotterySystem): u64 {
        lottery.ticket_count
    }

    /// 查詢彩票資訊
    public fun ticket_info(ticket: &LotteryTicket): (u64, u64, u64, u64) {
        (ticket.ticket_number, ticket.round, ticket.bet_amount, ticket.issued_at_ms)
    }
}

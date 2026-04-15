// ============================================================
// 遊戲相關型別定義
// ============================================================

/** 下注幣種 */
export type Currency = 'SUI' | 'USDC'

/** 單一格子狀態 */
export type TileState = 'hidden' | 'safe' | 'bomb'

/** 遊戲進行狀態 */
export type GamePhase =
  | 'idle'       // 尚未開始
  | 'playing'    // 遊戲中
  | 'exploded'   // 踩到炸彈
  | 'cashed_out' // 成功收手

/** 鏈上 GameSession 對象結構 */
export interface GameSessionFields {
  id: { id: string }
  player: string
  bet_amount: string
  tiles_remaining: string
  bombs_remaining: string
  safe_remaining: string
  safe_revealed: string
  revealed_mask: string
  current_multiplier: string
  status: number
}

/** 前端遊戲狀態 */
export interface GameState {
  sessionId: string | null
  phase: GamePhase
  betAmount: bigint
  currency: Currency
  tiles: TileState[]
  currentMultiplier: bigint
  safeRevealed: number
  revealDigests: string[]
}

/** 單局歷史記錄 */
export interface GameHistory {
  id: number
  phase: 'cashed_out' | 'exploded'
  digests: string[]
  betAmount: string
  currency: Currency
  timestamp: number
}

/** PlayerBalance（SUI）鏈上結構 */
export interface PlayerBalanceFields {
  id: { id: string }
  balance: { value: string }
}

/** PlayerBalanceUSDC 鏈上結構 */
export interface PlayerBalanceUSDCFields {
  id: { id: string }
  balance: { value: string }
}

/** LotterySystem 鏈上狀態 */
export interface LotteryInfo {
  round: number
  ticketCount: number
  lastDrawMs: number
  nextDrawMs: number
  winnerTicket: number
  pendingPrizeSui: bigint
  pendingPrizeUsdc: bigint
  prizePoolSui: bigint
  prizePoolUsdc: bigint
  /** prizes table 的物件 ID（用於查詢各輪待領獎金） */
  prizesTableId: string | null
}

/** LotteryTicket NFT */
export interface LotteryTicket {
  objectId: string
  player: string
  ticketNumber: number
  round: number
  betAmount: bigint
  issuedAtMs: number
}

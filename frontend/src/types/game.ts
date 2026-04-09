// ============================================================
// 遊戲相關型別定義
// ============================================================

/** 單一格子狀態 */
export type TileState = 'hidden' | 'safe' | 'bomb'

/** 遊戲進行狀態 */
export type GamePhase =
  | 'idle'       // 尚未開始，顯示下注介面
  | 'playing'    // 遊戲中，可翻格子或收手
  | 'exploded'   // 踩到炸彈，遊戲結束
  | 'cashed_out' // 成功收手

/** 鏈上 GameSession 對象結構（由 SuiObject 欄位解析而來） */
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

/** 前端使用的遊戲狀態（已解析） */
export interface GameState {
  /** 鏈上對象 ID */
  sessionId: string | null
  /** 當前遊戲階段 */
  phase: GamePhase
  /** 押注金額（MIST） */
  betAmount: bigint
  /** 16 格的狀態陣列（index 0-15） */
  tiles: TileState[]
  /** 當前倍數（原始精度，需除以 MULTIPLIER_SCALE） */
  currentMultiplier: bigint
  /** 已揭開安全格數 */
  safeRevealed: number
  /** 最近幾筆翻格子的 tx digest（用於公平性查詢） */
  revealDigests: string[]
}

/** 單局歷史記錄（用於公平性驗證的歷史查詢） */
export interface GameHistory {
  /** 唯一識別（開局時間戳） */
  id: number
  /** 遊戲結果 */
  phase: 'cashed_out' | 'exploded'
  /** 本局所有翻格子的 tx digest */
  digests: string[]
  /** 押注金額（MIST，序列化為字串） */
  betAmount: string
  /** 結束時間戳（ms） */
  timestamp: number
}

/** PlayerBalance 鏈上對象結構（content.fields 解析後） */
export interface PlayerBalanceFields {
  id: { id: string }
  /** Balance<SUI> 序列化為 { value: string }（u64 字串） */
  balance: { value: string }
}

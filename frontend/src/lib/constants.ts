// ============================================================
// 合約常數 — 所有與鏈上互動的 ID 集中在此管理
// 部署新版本後只需更新這裡
// ============================================================

/** 已部署的 Move Package ID */
export const PACKAGE_ID =
  '0xaa1718d089bc9bdb3acbcaf534790b6502701b21068bf802ae457d8781af4c8b'

/** GamePlatform 共享對象 ID */
export const GAME_PLATFORM_ID =
  '0x001e1072151d6ba1e95b1c9f8330430aca715cd6479363bc547d17c308bec4ce'

/** LotterySystem 共享對象 ID */
export const LOTTERY_SYSTEM_ID =
  '0x0d94d7d497183b5a793e25a9c861a83205bc0923aa9c9836791933c02e463f0a'

/** USDC TreasuryCap 共享對象 ID（測試用水龍頭） */
export const USDC_TREASURY_CAP_ID =
  '0x3c2f2d2a934380d1ceb1f72515e49f7b2fb6b96fa7602b853f61f9bbdd9328ba'

/** Sui 鏈上 Random 共享對象（固定地址） */
export const RANDOM_OBJECT_ID = '0x8'

/** Sui Clock 共享對象（固定地址） */
export const CLOCK_OBJECT_ID = '0x6'

/** USDC Coin Type（含 package prefix） */
export const USDC_COIN_TYPE =
  '0xaa1718d089bc9bdb3acbcaf534790b6502701b21068bf802ae457d8781af4c8b::usdc::USDC'

/** Move 模組名 */
export const MODULE_NAME = 'mines'

// ============================================================
// 遊戲常數（與合約保持一致）
// ============================================================

/** 格子總數 */
export const GRID_SIZE = 16

/** 炸彈數量（固定） */
export const BOMB_COUNT = 5

/** 倍數精度（合約中 MULTIPLIER_SCALE = 1_000_000_000） */
export const MULTIPLIER_SCALE = 1_000_000_000n

/** 莊家優勢（basis points，500 = 5%）*/
export const HOUSE_EDGE_BPS = 500

/** 1 SUI = 1_000_000_000 MIST */
export const MIST_PER_SUI = 1_000_000_000n

/** 1 USDC = 1_000_000 raw（6 位小數） */
export const RAW_PER_USDC = 1_000_000n

/** 最低押注 SUI：0.001 SUI */
export const MIN_BET_SUI = 0.001

/** 最高押注 SUI：10 SUI */
export const MAX_BET_SUI = 10

/** 最低押注 USDC：0.01 USDC */
export const MIN_BET_USDC = 0.01

/** 最高押注 USDC：100 USDC（合約 max_single_payout_usdc = 200 USDC） */
export const MAX_BET_USDC = 100

/** 抽獎間隔（毫秒） */
export const LOTTERY_INTERVAL_MS = 20 * 60 * 1000

// ============================================================
// Sui Explorer
// ============================================================

export const EXPLORER_BASE = 'https://suiscan.xyz/devnet'

export function explorerTx(digest: string) {
  return `${EXPLORER_BASE}/tx/${digest}`
}

export function explorerObject(id: string) {
  return `${EXPLORER_BASE}/object/${id}`
}

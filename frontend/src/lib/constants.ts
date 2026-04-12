// ============================================================
// 合約常數 — 所有與鏈上互動的 ID 集中在此管理
// 部署新版本後只需更新這裡
// ============================================================

/** 已部署的 Move Package ID */
export const PACKAGE_ID =
  '0xcb6711d9fe1ba096f6ae53d5179b8dc4f2fa82249a5bb9bfa86e6f947a5cc1d0'

/** GamePlatform 共享對象 ID */
export const GAME_PLATFORM_ID =
  '0x1503be4430c13cb9d9a90722a91ad1af22eb7667043f73351a533959fc02e94a'

/** LotterySystem 共享對象 ID */
export const LOTTERY_SYSTEM_ID =
  '0xbddac7c8a0ce7d6a464c22d964929ac7df22b53a2f2c3521219ace780879474c'

/** USDC TreasuryCap 共享對象 ID（測試用水龍頭） */
export const USDC_TREASURY_CAP_ID =
  '0xc557c03171ae603ee9679fd4c18b7fe9343b4d14ca38e2a5a150000f98dcf8c1'

/** Sui 鏈上 Random 共享對象（固定地址） */
export const RANDOM_OBJECT_ID = '0x8'

/** Sui Clock 共享對象（固定地址） */
export const CLOCK_OBJECT_ID = '0x6'

/** USDC Coin Type（含 package prefix） */
export const USDC_COIN_TYPE =
  '0xcb6711d9fe1ba096f6ae53d5179b8dc4f2fa82249a5bb9bfa86e6f947a5cc1d0::usdc::USDC'

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

/** 最低押注 SUI：0.01 SUI */
export const MIN_BET_SUI = 0.01

/** 最高押注 SUI：10 SUI */
export const MAX_BET_SUI = 10

/** 最低押注 USDC：1 USDC */
export const MIN_BET_USDC = 1

/** 最高押注 USDC：10 USDC（合約 max_bet_usdc = 10 USDC） */
export const MAX_BET_USDC = 10

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

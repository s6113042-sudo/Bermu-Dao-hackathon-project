// ============================================================
// 合約常數 — 所有與鏈上互動的 ID 集中在此管理
// 部署新版本後只需更新這裡
// ============================================================

/** 已部署的 Move Package ID */
export const PACKAGE_ID =
  '0xe3a2548fe26476e33ebff61983e821b6f5752843633ad0dcac2658811a0b4c20'

/** GamePlatform 共享對象 ID */
export const GAME_PLATFORM_ID =
  '0x7b7682ffe3e2516e6ea40dab7fcd77d92e6af96d3361e04fc5e689f04eff9ad1'

/** LotterySystem 共享對象 ID */
export const LOTTERY_SYSTEM_ID =
  '0x1df915d191665bf41d4256d4198b8f7952fa1a8df7929a4500655a0e9429e6d4'

/** USDC TreasuryCap 共享對象 ID（測試用水龍頭） */
export const USDC_TREASURY_CAP_ID =
  '0x35a675138e0eae1c0b805224c69fb33eb41a6f6ef17cc3867b49604a484ea034'

/** TSUI TreasuryCap 共享對象 ID（測試用水龍頭） */
export const TSUI_TREASURY_CAP_ID =
  '0x3d9f69929b14f5c42ff9968e1e5a5df2c15340172599e9f9b38b9e235464dff7'

/** Sui 鏈上 Random 共享對象（固定地址） */
export const RANDOM_OBJECT_ID = '0x8'

/** Sui Clock 共享對象（固定地址） */
export const CLOCK_OBJECT_ID = '0x6'

/** USDC Coin Type（含 package prefix） */
export const USDC_COIN_TYPE =
  '0xe3a2548fe26476e33ebff61983e821b6f5752843633ad0dcac2658811a0b4c20::usdc::USDC'

/** TSUI Coin Type（含 package prefix） */
export const TSUI_COIN_TYPE =
  '0xe3a2548fe26476e33ebff61983e821b6f5752843633ad0dcac2658811a0b4c20::tsui::TSUI'

/** Gas 錢包地址（代替玩家支付 gas） */
export const GAS_WALLET_ADDRESS =
  '0x6795632fbeaad554a196847837adfb02ce2be2c6282cfa3b104bb29caa413432'

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

/** 最低押注 SUI：0.05 SUI */
export const MIN_BET_SUI = 0.05

/** 最高押注 SUI：10 SUI */
export const MAX_BET_SUI = 10

/** 最低押注 USDC：0.05 USDC */
export const MIN_BET_USDC = 0.05

/** 最高押注 USDC：10 USDC（合約 max_bet_usdc = 10 USDC） */
export const MAX_BET_USDC = 10

/** 抽獎間隔（毫秒） */
export const LOTTERY_INTERVAL_MS = 20 * 60 * 1000

// ============================================================
// Sui Explorer
// ============================================================

export const EXPLORER_BASE = 'https://suiscan.xyz/testnet'

export function explorerTx(digest: string) {
  return `${EXPLORER_BASE}/tx/${digest}`
}

export function explorerObject(id: string) {
  return `${EXPLORER_BASE}/object/${id}`
}

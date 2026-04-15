// ============================================================
// 合約常數 — 所有與鏈上互動的 ID 集中在此管理
// 部署新版本後只需更新這裡
// ============================================================

/** 已部署的 Move Package ID */
export const PACKAGE_ID =
  '0x8aff1b991af9558e586941593cfa17a93181cdd0ef2363e3768f73e5729e7870'

/** GamePlatform 共享對象 ID */
export const GAME_PLATFORM_ID =
  '0xd6b7ebefcfeacdeb654ce0c2b081cbd0585ec74b8928ff06613ce2b772fcc692'

/** LotterySystem 共享對象 ID */
export const LOTTERY_SYSTEM_ID =
  '0xb9098fb88165dd430bab03061d86f6a0b9635e334f3a922ad36c1b4547689fc0'

/** USDC TreasuryCap 共享對象 ID（測試用水龍頭） */
export const USDC_TREASURY_CAP_ID =
  '0x4af6b325415d161e937d586803d59b4f5bafa415ea81c3c2f9c470d5ac6cda54'

/** TSUI TreasuryCap 共享對象 ID（測試用水龍頭） */
export const TSUI_TREASURY_CAP_ID =
  '0xb62df624604cd253d524585d7f01f860c610f277a7216927e45078ede65ec7c2'

/** Sui 鏈上 Random 共享對象（固定地址） */
export const RANDOM_OBJECT_ID = '0x8'

/** Sui Clock 共享對象（固定地址） */
export const CLOCK_OBJECT_ID = '0x6'

/** USDC Coin Type（含 package prefix） */
export const USDC_COIN_TYPE =
  '0x8aff1b991af9558e586941593cfa17a93181cdd0ef2363e3768f73e5729e7870::usdc::USDC'

/** TSUI Coin Type（含 package prefix） */
export const TSUI_COIN_TYPE =
  '0x8aff1b991af9558e586941593cfa17a93181cdd0ef2363e3768f73e5729e7870::tsui::TSUI'

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

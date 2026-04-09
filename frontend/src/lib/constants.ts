// ============================================================
// 合約常數 — 所有與鏈上互動的 ID 集中在此管理
// 部署新版本後只需更新這裡
// ============================================================

/**
 * 已部署的 Move Package ID
 * 來源：sui client publish 輸出的 PackageID
 */
export const PACKAGE_ID =
  '0x59675e77b17319852b0a13e35003b4cfebcbb24d1245cae6ebccf7b2755e6500'

/**
 * GamePlatform 共享對象 ID
 * 來源：publish 後 Created Objects 中 Owner: Shared 的那個
 */
export const GAME_PLATFORM_ID =
  '0x091eb4a3e6abad939b518d2807f5e97b7df9bdee24bf393484c162e3c87a3ade'

/**
 * Sui 鏈上 Random 共享對象（固定地址，所有網絡通用）
 */
export const RANDOM_OBJECT_ID = '0x8'

/**
 * Move 模組名
 */
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

/** 莊家優勢（basis points，500 = 5%）— 與合約 house_edge_bps 保持一致 */
export const HOUSE_EDGE_BPS = 500

/** 1 SUI = 1_000_000_000 MIST */
export const MIST_PER_SUI = 1_000_000_000n

/** 最低押注：0.001 SUI */
export const MIN_BET_SUI = 0.001

/** 最高押注：10 SUI */
export const MAX_BET_SUI = 10

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

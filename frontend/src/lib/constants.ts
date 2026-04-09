// ============================================================
// 合約常數 — 所有與鏈上互動的 ID 集中在此管理
// 部署新版本後只需更新這裡
// ============================================================

/**
 * 已部署的 Move Package ID
 * 來源：sui client publish 輸出的 PackageID
 */
export const PACKAGE_ID =
  '0x7fda537a472632fdf4f33c219bd1e74b7acd393e2ab3116a354b1cfc250bb006'

/**
 * GamePlatform 共享對象 ID
 * 來源：publish 後 Created Objects 中 Owner: Shared 的那個
 */
export const GAME_PLATFORM_ID =
  '0x8e26967b18b79bf4914a3e5dcebda9e8676103d756b505c4642764c3ddf33f73'

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

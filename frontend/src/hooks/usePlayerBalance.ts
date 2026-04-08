/**
 * usePlayerBalance
 *
 * 查詢當前錢包地址的 PlayerBalance 鏈上對象，回傳餘額。
 *
 * ── 整合待辦 ──
 * 1. 使用 useSuiClientQuery('getOwnedObjects') 過濾 PlayerBalance 類型
 * 2. 若不存在，提供 createPlayerBalance PTB
 * 3. 使用 useCurrentAccount() 取得地址
 *
 * 目前回傳 mock 值，等待整合。
 */

// TODO: 解開以下 import 並實作
// import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'
// import { PACKAGE_ID, MODULE_NAME } from '../lib/constants'
// import { PlayerBalanceFields } from '../types/game'

export interface UsePlayerBalanceResult {
  /** PlayerBalance 對象的 object ID（用於傳入合約函數） */
  playerBalanceId: string | null
  /** 餘額（MIST 單位） */
  balance: bigint | null
  /** 是否正在查詢 */
  isLoading: boolean
  /** 是否尚未建立 PlayerBalance 對象 */
  needsCreate: boolean
  /** 建立 PlayerBalance（呼叫 create_player_balance） */
  createPlayerBalance: () => Promise<void>
  /** 存款 */
  deposit: (amountMist: bigint) => Promise<void>
  /** 提款 */
  withdraw: (amountMist: bigint) => Promise<void>
  /** 重新整理餘額 */
  refetch: () => void
}

export function usePlayerBalance(): UsePlayerBalanceResult {
  // ════════════════════════════════════════════════
  // TODO: 整合實作
  //
  // const account = useCurrentAccount()
  //
  // const { data, isLoading, refetch } = useSuiClientQuery(
  //   'getOwnedObjects',
  //   {
  //     owner: account?.address ?? '',
  //     filter: {
  //       StructType: `${PACKAGE_ID}::${MODULE_NAME}::PlayerBalance`,
  //     },
  //     options: { showContent: true },
  //   },
  //   { enabled: !!account }
  // )
  //
  // 從 data 解析 PlayerBalance 對象和餘額...
  // ════════════════════════════════════════════════

  return {
    playerBalanceId: null,
    balance: null,
    isLoading: false,
    needsCreate: false,
    createPlayerBalance: async () => {
      console.warn('[TODO] createPlayerBalance: 尚未整合')
    },
    deposit: async (_amountMist: bigint) => {
      console.warn('[TODO] deposit: 尚未整合')
    },
    withdraw: async (_amountMist: bigint) => {
      console.warn('[TODO] withdraw: 尚未整合')
    },
    refetch: () => {
      console.warn('[TODO] refetch: 尚未整合')
    },
  }
}

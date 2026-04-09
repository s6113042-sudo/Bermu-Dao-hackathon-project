/**
 * usePlayerBalance
 *
 * 查詢 session 地址的 PlayerBalance 鏈上對象，回傳餘額。
 * 所有操作（建立/存款/提款）均由 session key 靜默執行，無需錢包彈窗。
 */

import { useSuiClientQuery } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { PACKAGE_ID, MODULE_NAME } from '../lib/constants'
import { UseSessionKeyResult } from './useSessionKey'

export interface UsePlayerBalanceResult {
  playerBalanceId: string | null
  balance: bigint | null
  isLoading: boolean
  needsCreate: boolean
  createPlayerBalance: () => Promise<string>
  deposit: (amountMist: bigint, explicitPbId?: string) => Promise<void>
  withdraw: (amountMist: bigint) => Promise<void>
  refetch: () => void
}

/** Balance<SUI> 在 Sui RPC 中可能是字串或 { value: string } 物件，統一解析 */
function parseBalance(raw: unknown): bigint {
  if (raw == null) return 0n
  if (typeof raw === 'string') return BigInt(raw)
  if (typeof raw === 'number') return BigInt(raw)
  if (typeof raw === 'object' && 'value' in (raw as object)) {
    return BigInt((raw as { value: string }).value)
  }
  return 0n
}

export function usePlayerBalance(session: UseSessionKeyResult): UsePlayerBalanceResult {
  const { sessionAddress, executeWithSession } = session

  const { data, isLoading, refetch } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: sessionAddress,
      filter: {
        StructType: `${PACKAGE_ID}::${MODULE_NAME}::PlayerBalance`,
      },
      options: { showContent: true },
    },
    { enabled: !!sessionAddress }
  )

  const pbObject = data?.data?.[0]
  const fields =
    pbObject?.data?.content && 'fields' in pbObject.data.content
      ? (pbObject.data.content.fields as Record<string, unknown>)
      : null

  const playerBalanceId =
    fields && fields.id && typeof fields.id === 'object'
      ? ((fields.id as { id: string }).id ?? null)
      : null

  const balance = fields ? parseBalance(fields.balance) : null
  const needsCreate = !isLoading && !!sessionAddress && !playerBalanceId

  // ── 建立 PlayerBalance，回傳新對象 ID（供立即 deposit 使用）──
  const createPlayerBalance = async (): Promise<string> => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::create_player_balance`,
    })
    const { effects } = await executeWithSession(tx)
    const created = effects?.created ?? []
    const pbObj = created.find(
      (obj: any) =>
        obj.owner &&
        typeof obj.owner === 'object' &&
        'AddressOwner' in obj.owner &&
        obj.owner.AddressOwner === sessionAddress
    )
    const newId: string = pbObj?.reference?.objectId ?? ''
    refetch()
    return newId
  }

  // ── 存款（接受明確的 pbId，避免 refetch 時序問題）──
  const deposit = async (amountMist: bigint, explicitPbId?: string) => {
    const pbId = explicitPbId ?? playerBalanceId
    if (!pbId) throw new Error('PlayerBalance 尚未建立')
    const tx = new Transaction()
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)])
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::deposit`,
      arguments: [tx.object(pbId), coin],
    })
    await executeWithSession(tx)
    refetch()
  }

  // ── 提款（session key 靜默執行）──
  const withdraw = async (amountMist: bigint) => {
    if (!playerBalanceId) throw new Error('PlayerBalance 尚未建立')
    const tx = new Transaction()
    const [coin] = tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::withdraw`,
      arguments: [tx.object(playerBalanceId), tx.pure.u64(amountMist)],
    })
    tx.transferObjects([coin], tx.pure.address(sessionAddress))
    await executeWithSession(tx)
    refetch()
  }

  return {
    playerBalanceId,
    balance,
    isLoading,
    needsCreate,
    createPlayerBalance,
    deposit,
    withdraw,
    refetch,
  }
}

/**
 * usePlayerBalance
 *
 * 管理 SUI 和 USDC 兩種遊戲帳戶。
 * USDC 在 devnet 使用公開 TreasuryCap 水龍頭鑄造，session key 靜默執行。
 */

import { useSuiClientQuery, useSuiClient } from '@mysten/dapp-kit'
import { useState, useEffect, useRef } from 'react'
import { Transaction } from '@mysten/sui/transactions'
import { PACKAGE_ID, MODULE_NAME, USDC_TREASURY_CAP_ID, USDC_COIN_TYPE, TSUI_TREASURY_CAP_ID, TSUI_COIN_TYPE } from '../lib/constants'
import { UseSessionKeyResult } from './useSessionKey'

/** 交易後連續輪詢，確保 RPC 快速同步 */
function scheduleRefetch(fn: () => void) {
  fn()
  const t1 = setTimeout(fn, 1200)
  const t2 = setTimeout(fn, 2800)
  const t3 = setTimeout(fn, 5000)
  return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
}

export interface UsePlayerBalanceResult {
  // ── SUI ──
  playerBalanceId: string | null
  balance: bigint | null
  isLoading: boolean
  needsCreate: boolean
  createPlayerBalance: () => Promise<string>
  deposit: (amountMist: bigint, explicitPbId?: string) => Promise<void>
  withdraw: (amountMist: bigint) => Promise<void>
  refetch: () => void

  // ── USDC ──
  playerBalanceUSDCId: string | null
  usdcBalance: bigint | null
  usdcLoading: boolean
  needsCreateUSDC: boolean
  createPlayerBalanceUSDC: () => Promise<string>
  depositUSDC: (amountRaw: bigint, explicitPbId?: string) => Promise<void>
  withdrawUSDC: (amountRaw: bigint) => Promise<void>
  refetchUSDC: () => void

  /** 樂觀調整顯示餘額（遊戲開局/收手後立即反映，不等 RPC） */
  adjustOptimistic: (suiDelta: bigint, usdcDelta: bigint) => void
}

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
  const suiClient = useSuiClient()

  // ── 樂觀餘額 delta（交易送出後立即調整，RPC 同步後歸零） ──
  const [suiDelta, setSuiDelta] = useState(0n)
  const [usdcDelta, setUsdcDelta] = useState(0n)
  const prevSuiBalance = useRef<bigint | null>(null)
  const prevUsdcBalance = useRef<bigint | null>(null)

  // ── SUI PlayerBalance ──
  const { data, isLoading, refetch } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: sessionAddress,
      filter: { StructType: `${PACKAGE_ID}::${MODULE_NAME}::PlayerBalance` },
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
    fields?.id && typeof fields.id === 'object'
      ? ((fields.id as { id: string }).id ?? null)
      : null

  const balanceChain = fields ? parseBalance(fields.balance) : null
  const needsCreate = !isLoading && !!sessionAddress && !playerBalanceId

  // ── USDC PlayerBalance ──
  const { data: usdcData, isLoading: usdcLoading, refetch: refetchUSDC } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: sessionAddress,
      filter: { StructType: `${PACKAGE_ID}::${MODULE_NAME}::PlayerBalanceUSDC` },
      options: { showContent: true },
    },
    { enabled: !!sessionAddress }
  )

  const usdcPbObject = usdcData?.data?.[0]
  const usdcFields =
    usdcPbObject?.data?.content && 'fields' in usdcPbObject.data.content
      ? (usdcPbObject.data.content.fields as Record<string, unknown>)
      : null

  const playerBalanceUSDCId =
    usdcFields?.id && typeof usdcFields.id === 'object'
      ? ((usdcFields.id as { id: string }).id ?? null)
      : null

  const usdcBalanceChain = usdcFields ? parseBalance(usdcFields.balance) : null
  const needsCreateUSDC = !usdcLoading && !!sessionAddress && !playerBalanceUSDCId

  // 鏈上資料更新後清除 delta（表示 RPC 已同步）
  useEffect(() => {
    if (balanceChain !== null && balanceChain !== prevSuiBalance.current) {
      prevSuiBalance.current = balanceChain
      setSuiDelta(0n)
    }
  }, [balanceChain])

  useEffect(() => {
    if (usdcBalanceChain !== null && usdcBalanceChain !== prevUsdcBalance.current) {
      prevUsdcBalance.current = usdcBalanceChain
      setUsdcDelta(0n)
    }
  }, [usdcBalanceChain])

  // 對外顯示的餘額 = 鏈上值 + 樂觀 delta（clamp 到 0）
  const balance = balanceChain !== null
    ? (balanceChain + suiDelta < 0n ? 0n : balanceChain + suiDelta)
    : null
  const usdcBalance = usdcBalanceChain !== null
    ? (usdcBalanceChain + usdcDelta < 0n ? 0n : usdcBalanceChain + usdcDelta)
    : null

  const adjustOptimistic = (suiD: bigint, usdcD: bigint) => {
    if (suiD !== 0n) setSuiDelta(prev => prev + suiD)
    if (usdcD !== 0n) setUsdcDelta(prev => prev + usdcD)
  }

  // ── SUI 函數 ──

  const createPlayerBalance = async (): Promise<string> => {
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::${MODULE_NAME}::create_player_balance` })
    const { digest, effects } = await executeWithSession(tx)
    // 等待交易確認，確保物件已上鏈後才返回 ID
    await suiClient.waitForTransaction({ digest })
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

  // 從 TreasuryCap 鑄造 TSUI 並存入 PlayerBalance（gas 由 gas 錢包代付）
  const deposit = async (amountMist: bigint, explicitPbId?: string) => {
    const pbId = explicitPbId ?? playerBalanceId
    if (!pbId) throw new Error('PlayerBalance 尚未建立')
    const tx = new Transaction()
    const [minted] = tx.moveCall({
      target: `0x2::coin::mint`,
      typeArguments: [TSUI_COIN_TYPE],
      arguments: [tx.object(TSUI_TREASURY_CAP_ID), tx.pure.u64(amountMist)],
    })
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::deposit`,
      arguments: [tx.object(pbId), minted],
    })
    setSuiDelta(prev => prev + amountMist)   // 樂觀加
    await executeWithSession(tx)
    scheduleRefetch(refetch)
  }

  const withdraw = async (amountMist: bigint) => {
    if (!playerBalanceId) throw new Error('PlayerBalance 尚未建立')
    const tx = new Transaction()
    const [coin] = tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::withdraw`,
      arguments: [tx.object(playerBalanceId), tx.pure.u64(amountMist)],
    })
    // 提取的 TSUI 送回 session 地址
    tx.transferObjects([coin], sessionAddress)
    setSuiDelta(prev => prev - amountMist)   // 樂觀減
    await executeWithSession(tx)
    scheduleRefetch(refetch)
  }

  // ── USDC 函數 ──

  const createPlayerBalanceUSDC = async (): Promise<string> => {
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::${MODULE_NAME}::create_player_balance_usdc` })
    const { digest, effects } = await executeWithSession(tx)
    await suiClient.waitForTransaction({ digest })
    const created = effects?.created ?? []
    const pbObj = created.find(
      (obj: any) =>
        obj.owner &&
        typeof obj.owner === 'object' &&
        'AddressOwner' in obj.owner &&
        obj.owner.AddressOwner === sessionAddress
    )
    const newId: string = pbObj?.reference?.objectId ?? ''
    refetchUSDC()
    return newId
  }

  // 從 TreasuryCap 鑄造 USDC 並存入 PlayerBalanceUSDC（session 靜默執行）
  const depositUSDC = async (amountRaw: bigint, explicitPbId?: string) => {
    const pbId = explicitPbId ?? playerBalanceUSDCId
    if (!pbId) throw new Error('PlayerBalanceUSDC 尚未建立')
    const tx = new Transaction()
    const [minted] = tx.moveCall({
      target: `0x2::coin::mint`,
      typeArguments: [USDC_COIN_TYPE],
      arguments: [tx.object(USDC_TREASURY_CAP_ID), tx.pure.u64(amountRaw)],
    })
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::deposit_usdc`,
      arguments: [tx.object(pbId), minted],
    })
    setUsdcDelta(prev => prev + amountRaw)   // 樂觀加
    await executeWithSession(tx)
    scheduleRefetch(refetchUSDC)
  }

  const withdrawUSDC = async (amountRaw: bigint) => {
    if (!playerBalanceUSDCId) throw new Error('PlayerBalanceUSDC 尚未建立')
    const tx = new Transaction()
    const [coin] = tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::withdraw_usdc`,
      arguments: [tx.object(playerBalanceUSDCId), tx.pure.u64(amountRaw)],
    })
    tx.transferObjects([coin], tx.pure.address(sessionAddress))
    setUsdcDelta(prev => prev - amountRaw)   // 樂觀減
    await executeWithSession(tx)
    scheduleRefetch(refetchUSDC)
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

    playerBalanceUSDCId,
    usdcBalance,
    usdcLoading,
    needsCreateUSDC,
    createPlayerBalanceUSDC,
    depositUSDC,
    withdrawUSDC,
    refetchUSDC,

    adjustOptimistic,
  }
}

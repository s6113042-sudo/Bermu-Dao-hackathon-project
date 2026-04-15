/**
 * useSessionKey — 會話密鑰管理
 *
 * 原理：
 *   在 localStorage 生成並持久化一個 Ed25519 臨時密鑰對（session keypair）。
 *   用戶只需一次錢包授權，將 SUI 轉入 session 地址。
 *   之後所有遊戲操作由 session key 在背後靜默簽名，無需任何彈窗。
 *
 * 注意：
 *   - Session 地址上的資金存在 localStorage，清除瀏覽器資料會遺失
 *   - 建議只存放少量 SUI（夠遊玩即可）
 */

import { useState, useEffect } from 'react'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { useSuiClient } from '@mysten/dapp-kit'
import { getGasKeypair, getGasAddress } from '../lib/gasWallet'
const STORAGE_KEY = 'mines_session_privkey'

export interface UseSessionKeyResult {
  /** Session 錢包地址（合約互動使用此地址）*/
  sessionAddress: string
  /** Session 地址上的 SUI 餘額（MIST）*/
  sessionSuiBalance: bigint | null
  /** 是否正在查詢 session 餘額 */
  balanceLoading: boolean
  /**
   * 從主錢包充值到 session 地址（唯一需要錢包授權的操作）
   * 同時也會建立 PlayerBalance（若尚未建立）
   */
  fundSession: (amountMist: bigint) => Promise<string>
  /**
   * 用 session key 靜默執行交易（無需錢包彈窗）
   * 回傳交易 digest
   */
  executeWithSession: (tx: Transaction) => Promise<{ digest: string; effects: any; events: any[] }>
  /** 清除 session（⚠ 請先提款再清除）*/
  clearSession: () => void
  /** 重新整理 session 餘額 */
  refetchBalance: () => void
}

function getOrCreateKeypair(): Ed25519Keypair {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      // getSecretKey() 回傳 bech32 字串，fromSecretKey 直接接受
      return Ed25519Keypair.fromSecretKey(stored)
    }
  } catch {
    // 格式損壞，重新生成
  }
  const kp = new Ed25519Keypair()
  localStorage.setItem(STORAGE_KEY, kp.getSecretKey())
  return kp
}

export function useSessionKey(): UseSessionKeyResult {
  const suiClient = useSuiClient()

  // Keypair 只初始化一次，存在 state 避免每次 render 重新生成
  const [keypair] = useState<Ed25519Keypair>(getOrCreateKeypair)
  const sessionAddress = keypair.getPublicKey().toSuiAddress()

  // Session 地址的 SUI 餘額
  const [sessionSuiBalance, setSessionSuiBalance] = useState<bigint | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [fetchTick, setFetchTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setBalanceLoading(true)
    suiClient.getBalance({ owner: sessionAddress }).then((res) => {
      if (!cancelled) {
        setSessionSuiBalance(BigInt(res.totalBalance))
        setBalanceLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setBalanceLoading(false)
    })
    return () => { cancelled = true }
  }, [sessionAddress, suiClient, fetchTick])

  const refetchBalance = () => setFetchTick((t) => t + 1)

  // ── Session 初始化（gas 由 gas 錢包代付，玩家無需持有原生 SUI）──
  const fundSession = async (_amountMist: bigint): Promise<string> => {
    // gas 由 gas 錢包代付，此函式僅回傳 session 地址供呼叫方使用
    // 不再需要從主錢包轉移原生 SUI
    refetchBalance()
    return sessionAddress
  }

  // ── 用 session key 靜默執行交易（gas 由 gas 錢包代付）──
  const executeWithSession = async (tx: Transaction) => {
    const gasAddress = getGasAddress()
    const gasKeypair = getGasKeypair()

    tx.setSender(sessionAddress)
    tx.setGasOwner(gasAddress)
    tx.setGasBudget(10_000_000)

    const txBytes = await tx.build({ client: suiClient })

    // session key 簽署 tx data
    const { signature: senderSig } = await keypair.signTransaction(txBytes)
    // gas 錢包簽署 gas data
    const { signature: sponsorSig } = await gasKeypair.signTransaction(txBytes)

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: [senderSig, sponsorSig],
      options: { showEffects: true, showEvents: true },
    })
    refetchBalance()
    return {
      digest: result.digest,
      effects: result.effects,
      events: result.events ?? [],
    }
  }

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    sessionAddress,
    sessionSuiBalance,
    balanceLoading,
    fundSession,
    executeWithSession,
    clearSession,
    refetchBalance,
  }
}

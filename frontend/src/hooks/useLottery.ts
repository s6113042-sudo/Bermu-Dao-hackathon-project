/**
 * useLottery
 *
 * 查詢 LotterySystem 狀態、玩家彩票 NFT，提供觸發抽獎和領獎功能。
 * 每 10 秒自動刷新一次；交易後以 1.2s / 2.8s / 5s 連續輪詢確保 RPC 同步。
 */

import { useState, useEffect, useCallback } from 'react'
import { useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { LotteryInfo, LotteryTicket } from '../types/game'
import {
  PACKAGE_ID,
  LOTTERY_SYSTEM_ID,
  CLOCK_OBJECT_ID,
  RANDOM_OBJECT_ID,
} from '../lib/constants'
import { UseSessionKeyResult } from './useSessionKey'


export interface UseLotteryResult {
  lotteryInfo: LotteryInfo | null
  lotteryLoading: boolean
  myTickets: LotteryTicket[]
  ticketsLoading: boolean
  winningTicket: LotteryTicket | null   // 玩家持有的中獎彩票（前一輪）
  triggerLottery: () => Promise<void>
  claimPrize: (ticketId: string, playerBalanceId: string, playerBalanceUSDCId: string | null) => Promise<void>
  discardTicket: (ticketId: string) => Promise<void>
  discardAllOld: (ticketIds: string[]) => Promise<void>  // 一鍵回收所有舊彩票
  refetch: () => void
  isBusy: boolean
  lotteryError: string | null
}

export function useLottery(session: UseSessionKeyResult): UseLotteryResult {
  const { sessionAddress, executeWithSession } = session
  const suiClient = useSuiClient()

  const [lotteryInfo, setLotteryInfo] = useState<LotteryInfo | null>(null)
  const [lotteryLoading, setLotteryLoading] = useState(false)
  const [myTickets, setMyTickets] = useState<LotteryTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [lotteryError, setLotteryError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  // ── 查詢 LotterySystem 狀態 ──
  useEffect(() => {
    let cancelled = false
    setLotteryLoading(true)
    suiClient
      .getObject({ id: LOTTERY_SYSTEM_ID, options: { showContent: true } })
      .then((res) => {
        if (cancelled) return
        const content = res.data?.content
        if (!content || !('fields' in content)) return
        const f = content.fields as Record<string, any>
        setLotteryInfo({
          round: Number(f.round),
          ticketCount: Number(f.ticket_count),
          lastDrawMs: Number(f.last_draw_ms),
          nextDrawMs: Number(f.last_draw_ms) + 20 * 60 * 1000,
          winnerTicket: Number(f.winner_ticket),
          pendingPrizeSui: BigInt(f.pending_prize_sui ?? 0),
          pendingPrizeUsdc: BigInt(f.pending_prize_usdc ?? 0),
          prizePoolSui: BigInt(
            typeof f.prize_pool_sui === 'object'
              ? (f.prize_pool_sui?.value ?? 0)
              : (f.prize_pool_sui ?? 0)
          ),
          prizePoolUsdc: BigInt(
            typeof f.prize_pool_usdc === 'object'
              ? (f.prize_pool_usdc?.value ?? 0)
              : (f.prize_pool_usdc ?? 0)
          ),
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLotteryLoading(false) })
    return () => { cancelled = true }
  }, [suiClient, tick])

  // ── 查詢玩家持有的彩票 NFT ──
  useEffect(() => {
    if (!sessionAddress) return
    let cancelled = false
    setTicketsLoading(true)
    suiClient
      .getOwnedObjects({
        owner: sessionAddress,
        filter: { StructType: `${PACKAGE_ID}::lottery::LotteryTicket` },
        options: { showContent: true },
      })
      .then((res) => {
        if (cancelled) return
        const tickets: LotteryTicket[] = []
        for (const obj of res.data ?? []) {
          const content = obj.data?.content
          if (!content || !('fields' in content)) continue
          const f = content.fields as Record<string, any>
          tickets.push({
            objectId: obj.data?.objectId ?? '',
            player: f.player,
            ticketNumber: Number(f.ticket_number),
            round: Number(f.round),
            betAmount: BigInt(f.bet_amount ?? 0),
            issuedAtMs: Number(f.issued_at_ms ?? 0),
          })
        }
        setMyTickets(tickets)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTicketsLoading(false) })
    return () => { cancelled = true }
  }, [suiClient, sessionAddress, tick])

  // 每 10 秒自動刷新
  useEffect(() => {
    const id = setInterval(refetch, 10_000)
    return () => clearInterval(id)
  }, [refetch])

  // 找出中獎彩票：上一輪（round - 1）且 ticket_number == winner_ticket
  const winningTicket = lotteryInfo
    ? (myTickets.find(
        (t) =>
          t.round === lotteryInfo.round - 1 &&
          t.ticketNumber === lotteryInfo.winnerTicket &&
          (lotteryInfo.pendingPrizeSui > 0n || lotteryInfo.pendingPrizeUsdc > 0n)
      ) ?? null)
    : null

  // ── 觸發抽獎 ──
  const triggerLottery = async () => {
    setIsBusy(true)
    setLotteryError(null)
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::lottery::trigger_lottery`,
        arguments: [
          tx.object(LOTTERY_SYSTEM_ID),
          tx.object(RANDOM_OBJECT_ID),   // 合約順序：random 在 clock 之前
          tx.object(CLOCK_OBJECT_ID),
        ],
      })
      const { digest } = await executeWithSession(tx)
      await suiClient.waitForTransaction({ digest })
      refetch()
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      const codeMatch = msg.match(/abort code: (\d+)/) || msg.match(/MoveAbort\(.*?,\s*(\d+)\)/)
      const code = codeMatch ? parseInt(codeMatch[1]) : -1
      if (code === 200) {
        setLotteryError('開獎時間尚未到，請等倒數結束後再試')
      } else if (code === 201 || code === 202 || code === 203 || code === 204) {
        setLotteryError('本輪無待領獎金或彩票驗證失敗')
      } else {
        setLotteryError('操作失敗：' + msg.slice(0, 80))
      }
    } finally {
      setIsBusy(false)
    }
  }

  // ── 領取獎金（自動存入 PlayerBalance） ──
  const claimPrize = async (
    ticketId: string,
    playerBalanceId: string,
    playerBalanceUSDCId: string | null,
  ) => {
    setIsBusy(true)
    setLotteryError(null)
    try {
      const tx = new Transaction()
      // 1. claim_prize 回傳 (Coin<SUI>, Coin<USDC>)
      const [suiCoin, usdcCoin] = tx.moveCall({
        target: `${PACKAGE_ID}::lottery::claim_prize`,
        arguments: [tx.object(LOTTERY_SYSTEM_ID), tx.object(ticketId)],
      })
      // 2. 存入 SUI PlayerBalance
      tx.moveCall({
        target: `${PACKAGE_ID}::mines::deposit_prize_sui`,
        arguments: [tx.object(playerBalanceId), suiCoin],
      })
      // 3. 存入 USDC PlayerBalance（有才存）
      if (playerBalanceUSDCId) {
        tx.moveCall({
          target: `${PACKAGE_ID}::mines::deposit_prize_usdc`,
          arguments: [tx.object(playerBalanceUSDCId), usdcCoin],
        })
      } else {
        // 無 USDC 帳戶時轉給自己（避免零幣懸空）
        tx.transferObjects([usdcCoin], tx.pure.address(sessionAddress!))
      }
      const { digest } = await executeWithSession(tx)
      await suiClient.waitForTransaction({ digest })
      refetch()
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      const codeMatch = msg.match(/abort code: (\d+)/) || msg.match(/MoveAbort\(.*?,\s*(\d+)\)/)
      const code = codeMatch ? parseInt(codeMatch[1]) : -1
      if (code === 201) setLotteryError('彩票輪次不符，請確認是否為上一輪彩票')
      else if (code === 202) setLotteryError('彩票號碼不符，您未中獎')
      else if (code === 203) setLotteryError('彩票發放時間異常')
      else if (code === 204) setLotteryError('本輪無待領獎金')
      else setLotteryError('領獎失敗：' + msg.slice(0, 80))
    } finally {
      setIsBusy(false)
    }
  }

  // ── 丟棄單張非中獎彩票 ──
  const discardTicket = async (ticketId: string) => {
    setIsBusy(true)
    setLotteryError(null)
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::lottery::discard_ticket`,
        arguments: [tx.object(ticketId), tx.object(LOTTERY_SYSTEM_ID)],
      })
      const { digest } = await executeWithSession(tx)
      await suiClient.waitForTransaction({ digest })
      refetch()
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      const codeMatch = msg.match(/abort code: (\d+)/) || msg.match(/MoveAbort\(.*?,\s*(\d+)\)/)
      const code = codeMatch ? parseInt(codeMatch[1]) : -1
      if (code === 201) {
        setLotteryError('本輪彩票尚未結束，開獎後才可丟棄')
      } else {
        setLotteryError('丟棄失敗：' + msg.slice(0, 80))
      }
    } finally {
      setIsBusy(false)
    }
  }

  // ── 一鍵回收所有舊彩票（PTB 批次，一筆交易） ──
  const discardAllOld = async (ticketIds: string[]) => {
    if (ticketIds.length === 0) return
    setIsBusy(true)
    setLotteryError(null)
    try {
      const tx = new Transaction()
      for (const id of ticketIds) {
        tx.moveCall({
          target: `${PACKAGE_ID}::lottery::discard_ticket`,
          arguments: [tx.object(id), tx.object(LOTTERY_SYSTEM_ID)],
        })
      }
      const { digest } = await executeWithSession(tx)
      await suiClient.waitForTransaction({ digest })
      refetch()
    } catch (e: any) {
      setLotteryError('批次回收失敗，請重試')
    } finally {
      setIsBusy(false)
    }
  }

  return {
    lotteryInfo,
    lotteryLoading,
    myTickets,
    ticketsLoading,
    winningTicket,
    triggerLottery,
    claimPrize,
    discardTicket,
    discardAllOld,
    refetch,
    isBusy,
    lotteryError,
  }
}

/**
 * useLottery
 *
 * 查詢 LotterySystem 狀態、玩家彩票 NFT，提供觸發抽獎和領獎功能。
 * 每 10 秒自動刷新；交易後 waitForTransaction 確保 RPC 同步再 refetch。
 *
 * 獎金採物理分離設計（prizes Table），中獎者隨時可領，不受後續開獎影響。
 * 掃描玩家所有彩票對照 prizes table，找出所有歷史中獎票。
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
  /** 玩家持有的所有中獎彩票（可能跨多輪） */
  winningTickets: LotteryTicket[]
  /** 相容舊介面：取第一張中獎票 */
  winningTicket: LotteryTicket | null
  triggerLottery: () => Promise<void>
  claimPrize: (ticketId: string, playerBalanceId: string, playerBalanceUSDCId: string | null) => Promise<void>
  claimAllPrizes: (ticketIds: string[], playerBalanceId: string, playerBalanceUSDCId: string | null) => Promise<void>
  discardTicket: (ticketId: string) => Promise<void>
  discardAllOld: (ticketIds: string[]) => Promise<void>
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
  const [winningTickets, setWinningTickets] = useState<LotteryTicket[]>([])
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

        // 取出 prizes table 的物件 ID
        const prizesTableId: string | null =
          f.prizes?.fields?.id?.id ?? null

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
          prizesTableId,
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

  // ── 掃描 prizes table，找出所有歷史中獎票 ──
  useEffect(() => {
    if (!lotteryInfo?.prizesTableId || myTickets.length === 0) {
      setWinningTickets([])
      return
    }
    const tableId = lotteryInfo.prizesTableId
    let cancelled = false

    const checkAll = async () => {
      const winners: LotteryTicket[] = []
      await Promise.all(
        myTickets.map(async (ticket) => {
          try {
            const prizeObj = await suiClient.getDynamicFieldObject({
              parentId: tableId,
              name: { type: 'u64', value: String(ticket.round) },
            })
            const content = prizeObj.data?.content
            if (!content || !('fields' in content)) return
            const f = content.fields as Record<string, any>
            const prizeFields = f.value?.fields ?? f
            if (Number(prizeFields.winner_ticket) === ticket.ticketNumber) {
              winners.push(ticket)
            }
          } catch {
            // 該輪沒有 prize entry（未開獎或已領取）
          }
        })
      )
      if (!cancelled) setWinningTickets(winners)
    }

    checkAll()
    return () => { cancelled = true }
  }, [lotteryInfo?.prizesTableId, myTickets, suiClient])

  // 每 10 秒自動刷新
  useEffect(() => {
    const id = setInterval(refetch, 10_000)
    return () => clearInterval(id)
  }, [refetch])

  const winningTicket = winningTickets[0] ?? null

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
          tx.object(RANDOM_OBJECT_ID),
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
      const [suiCoin, usdcCoin] = tx.moveCall({
        target: `${PACKAGE_ID}::lottery::claim_prize`,
        arguments: [tx.object(LOTTERY_SYSTEM_ID), tx.object(ticketId)],
      })
      tx.moveCall({
        target: `${PACKAGE_ID}::mines::deposit_prize_sui`,
        arguments: [tx.object(playerBalanceId), suiCoin],
      })
      if (playerBalanceUSDCId) {
        tx.moveCall({
          target: `${PACKAGE_ID}::mines::deposit_prize_usdc`,
          arguments: [tx.object(playerBalanceUSDCId), usdcCoin],
        })
      } else {
        tx.transferObjects([usdcCoin], tx.pure.address(sessionAddress!))
      }
      const { digest } = await executeWithSession(tx)
      await suiClient.waitForTransaction({ digest })
      refetch()
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      const codeMatch = msg.match(/abort code: (\d+)/) || msg.match(/MoveAbort\(.*?,\s*(\d+)\)/)
      const code = codeMatch ? parseInt(codeMatch[1]) : -1
      if (code === 201) setLotteryError('彩票輪次不符')
      else if (code === 202) setLotteryError('彩票號碼不符，您未中獎')
      else if (code === 203) setLotteryError('彩票發放時間異常')
      else if (code === 204) setLotteryError('本輪無待領獎金')
      else setLotteryError('領獎失敗：' + msg.slice(0, 80))
    } finally {
      setIsBusy(false)
    }
  }

  // ── 一鍵領取所有中獎獎金（PTB 批次，一筆交易） ──
  const claimAllPrizes = async (
    ticketIds: string[],
    playerBalanceId: string,
    playerBalanceUSDCId: string | null,
  ) => {
    if (ticketIds.length === 0) return
    setIsBusy(true)
    setLotteryError(null)
    try {
      const tx = new Transaction()
      const suiCoins: any[] = []
      const usdcCoins: any[] = []

      for (const ticketId of ticketIds) {
        const [suiCoin, usdcCoin] = tx.moveCall({
          target: `${PACKAGE_ID}::lottery::claim_prize`,
          arguments: [tx.object(LOTTERY_SYSTEM_ID), tx.object(ticketId)],
        })
        suiCoins.push(suiCoin)
        usdcCoins.push(usdcCoin)
      }

      // 合併所有 SUI 獎金後存入 PlayerBalance
      if (suiCoins.length > 1) {
        tx.mergeCoins(suiCoins[0], suiCoins.slice(1))
      }
      tx.moveCall({
        target: `${PACKAGE_ID}::mines::deposit_prize_sui`,
        arguments: [tx.object(playerBalanceId), suiCoins[0]],
      })

      // 合併所有 USDC 獎金後存入 PlayerBalance
      if (usdcCoins.length > 1) {
        tx.mergeCoins(usdcCoins[0], usdcCoins.slice(1))
      }
      if (playerBalanceUSDCId) {
        tx.moveCall({
          target: `${PACKAGE_ID}::mines::deposit_prize_usdc`,
          arguments: [tx.object(playerBalanceUSDCId), usdcCoins[0]],
        })
      } else {
        tx.transferObjects([usdcCoins[0]], tx.pure.address(sessionAddress!))
      }

      const { digest } = await executeWithSession(tx)
      await suiClient.waitForTransaction({ digest })
      refetch()
    } catch (e: any) {
      setLotteryError('批次領獎失敗：' + (e?.message ?? String(e)).slice(0, 80))
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
    winningTickets,
    winningTicket,
    triggerLottery,
    claimPrize,
    claimAllPrizes,
    discardTicket,
    discardAllOld,
    refetch,
    isBusy,
    lotteryError,
  }
}

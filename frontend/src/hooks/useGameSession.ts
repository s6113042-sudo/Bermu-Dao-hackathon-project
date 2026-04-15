/**
 * useGameSession
 *
 * 管理單局遊戲的完整生命週期，支援 SUI 和 USDC 雙幣種。
 * reveal_tile 和 cashout 現在需要傳入 LotterySystem 和 Clock。
 */

import { useState, useRef } from 'react'
import { Transaction } from '@mysten/sui/transactions'
import { GameState, TileState, GameHistory, Currency } from '../types/game'
import {
  PACKAGE_ID,
  MODULE_NAME,
  GAME_PLATFORM_ID,
  RANDOM_OBJECT_ID,
  CLOCK_OBJECT_ID,
  LOTTERY_SYSTEM_ID,
  GRID_SIZE,
} from '../lib/constants'
import { UseSessionKeyResult } from './useSessionKey'

const HISTORY_STORAGE_KEY = 'mines_game_history'
const MAX_HISTORY = 10

function initialTiles(): TileState[] {
  return Array(GRID_SIZE).fill('hidden') as TileState[]
}

const initialState: GameState = {
  sessionId: null,
  phase: 'idle',
  betAmount: 0n,
  currency: 'SUI',
  tiles: initialTiles(),
  currentMultiplier: 1_000_000_000n,
  safeRevealed: 0,
  revealDigests: [],
}

function loadHistory(): GameHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as GameHistory[]
  } catch {
    return []
  }
}

function saveHistory(history: GameHistory[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {}
}

function appendHistory(entry: GameHistory): GameHistory[] {
  const prev = loadHistory()
  const next = [entry, ...prev].slice(0, MAX_HISTORY)
  saveHistory(next)
  return next
}

export interface UseGameSessionResult {
  gameState: GameState
  isProcessing: boolean
  error: string | null
  gameHistory: GameHistory[]
  startGame: (betAmount: bigint, playerBalanceId: string, currency: Currency) => Promise<void>
  revealTile: (index: number) => Promise<void>
  cashout: (playerBalanceId: string) => Promise<void>
  cancelGame: (playerBalanceId: string) => Promise<void>
  destroyExploded: () => Promise<void>
  resetGame: () => void
}

export function useGameSession(session: UseSessionKeyResult): UseGameSessionResult {
  const { sessionAddress, executeWithSession } = session
  const [gameState, setGameState] = useState<GameState>(initialState)
  // 追蹤 session 物件的最新版本，避免 RPC 查詢舊版本造成衝突
  const sessionObjRef = useRef<{ objectId: string; version: string; digest: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameHistory, setGameHistory] = useState<GameHistory[]>(() => loadHistory())
  const [gameStartTime, setGameStartTime] = useState<number>(0)

  // ── 開始新遊戲 ──
  const startGame = async (betAmount: bigint, playerBalanceId: string, currency: Currency) => {
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      const isSUI = currency === 'SUI'
      const startFn = isSUI ? 'start_game' : 'start_game_usdc'
      const keepFn = isSUI ? 'keep_game' : 'keep_game_usdc'

      const [gameSession] = tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::${startFn}`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          tx.object(playerBalanceId),
          tx.pure.u64(betAmount),
        ],
      })
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::${keepFn}`,
        arguments: [gameSession],
      })

      const { effects } = await executeWithSession(tx)

      const created = effects?.created ?? []
      const sessionObj = created.find(
        (obj: any) =>
          obj.owner &&
          typeof obj.owner === 'object' &&
          'AddressOwner' in obj.owner &&
          obj.owner.AddressOwner === sessionAddress
      )
      const sessionId: string | null = sessionObj?.reference?.objectId ?? null
      // 記錄初始物件版本
      sessionObjRef.current = sessionObj?.reference ?? null

      const now = Date.now()
      setGameStartTime(now)
      setGameState({
        ...initialState,
        sessionId,
        phase: 'playing',
        betAmount,
        currency,
        tiles: initialTiles(),
      })
    } catch (e: any) {
      setError(parseError(e))
      throw e
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 揭開格子（含 lottery + clock） ──
  const revealTile = async (index: number) => {
    if (gameState.phase !== 'playing' || isProcessing || !gameState.sessionId) return
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      const isSUI = gameState.currency === 'SUI'
      const revealFn = isSUI ? 'reveal_tile' : 'reveal_tile_usdc'

      // 用精確版本傳入 session 物件，跳過 RPC 查詢並避免版本衝突
      const sessionArg = sessionObjRef.current
        ? tx.objectRef(sessionObjRef.current)
        : tx.object(gameState.sessionId!)

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::${revealFn}`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          sessionArg,
          tx.pure.u64(index),
          tx.object(RANDOM_OBJECT_ID),
          tx.object(LOTTERY_SYSTEM_ID),
          tx.object(CLOCK_OBJECT_ID),
        ],
      })

      const { digest, events, effects } = await executeWithSession(tx)

      // 從 effects 取得最新物件版本，供下一次翻格使用
      const mutated: any[] = effects?.mutated ?? []
      const updatedRef = mutated.find((o: any) => o.reference?.objectId === gameState.sessionId)
      if (updatedRef?.reference) sessionObjRef.current = updatedRef.reference

      const tileEvent = events.find((e: any) => e.type?.includes('TileRevealed'))
      if (!tileEvent) throw new Error('未收到 TileRevealed 事件')

      const { is_bomb, multiplier } = tileEvent.parsedJson as {
        is_bomb: boolean
        multiplier: string
      }

      if (is_bomb) {
        setGameState((prev) => {
          const newTiles = [...prev.tiles]
          newTiles[index] = 'bomb'
          const newDigests = [...prev.revealDigests, digest]
          const entry: GameHistory = {
            id: gameStartTime,
            phase: 'exploded',
            digests: newDigests,
            betAmount: prev.betAmount.toString(),
            currency: prev.currency,
            timestamp: Date.now(),
          }
          const updated = appendHistory(entry)
          setGameHistory(updated)
          return { ...prev, tiles: newTiles, phase: 'exploded', currentMultiplier: 0n, revealDigests: newDigests }
        })
      } else {
        setGameState((prev) => {
          const newTiles = [...prev.tiles]
          newTiles[index] = 'safe'
          return {
            ...prev,
            tiles: newTiles,
            phase: 'playing',
            safeRevealed: prev.safeRevealed + 1,
            currentMultiplier: BigInt(multiplier),
            revealDigests: [...prev.revealDigests, digest],
          }
        })
      }
    } catch (e: any) {
      setError(parseError(e))
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 收手（含 lottery + clock） ──
  const cashout = async (playerBalanceId: string) => {
    if (gameState.phase !== 'playing' || isProcessing || !gameState.sessionId) return
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      const isSUI = gameState.currency === 'SUI'
      const cashoutFn = isSUI ? 'cashout' : 'cashout_usdc'

      const sessionArg = sessionObjRef.current
        ? tx.objectRef(sessionObjRef.current)
        : tx.object(gameState.sessionId!)

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::${cashoutFn}`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          sessionArg,
          tx.object(playerBalanceId),
          tx.object(LOTTERY_SYSTEM_ID),
          tx.object(CLOCK_OBJECT_ID),
        ],
      })
      await executeWithSession(tx)
      sessionObjRef.current = null

      setGameState((prev) => {
        const entry: GameHistory = {
          id: gameStartTime,
          phase: 'cashed_out',
          digests: prev.revealDigests,
          betAmount: prev.betAmount.toString(),
          currency: prev.currency,
          timestamp: Date.now(),
        }
        const updated = appendHistory(entry)
        setGameHistory(updated)
        return { ...prev, phase: 'cashed_out' }
      })
    } catch (e: any) {
      setError(parseError(e))
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 取消遊戲（0 次翻格） ──
  const cancelGame = async (playerBalanceId: string) => {
    if (gameState.phase !== 'playing' || isProcessing || !gameState.sessionId) return
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      const isSUI = gameState.currency === 'SUI'
      const cancelFn = isSUI ? 'cancel_game' : 'cancel_game_usdc'

      const sessionArg = sessionObjRef.current
        ? tx.objectRef(sessionObjRef.current)
        : tx.object(gameState.sessionId!)

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::${cancelFn}`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          sessionArg,
          tx.object(playerBalanceId),
        ],
      })
      await executeWithSession(tx)
      sessionObjRef.current = null

      setGameState((prev) => {
        const entry: GameHistory = {
          id: gameStartTime,
          phase: 'cashed_out',
          digests: prev.revealDigests,
          betAmount: prev.betAmount.toString(),
          currency: prev.currency,
          timestamp: Date.now(),
        }
        const updated = appendHistory(entry)
        setGameHistory(updated)
        return { ...prev, phase: 'cashed_out' }
      })
    } catch (e: any) {
      setError(parseError(e))
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 清理爆炸遊戲 ──
  const destroyExploded = async () => {
    if (!gameState.sessionId) {
      setGameState(initialState)
      return
    }
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      const isSUI = gameState.currency === 'SUI'
      const destroyFn = isSUI ? 'destroy_exploded_game' : 'destroy_exploded_game_usdc'

      const sessionArg = sessionObjRef.current
        ? tx.objectRef(sessionObjRef.current)
        : tx.object(gameState.sessionId!)

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::${destroyFn}`,
        arguments: [sessionArg],
      })
      await executeWithSession(tx)
      sessionObjRef.current = null
    } catch (e: any) {
      setError(parseError(e))
    } finally {
      setIsProcessing(false)
      setGameState(initialState)
    }
  }

  const resetGame = () => {
    setGameState(initialState)
    setError(null)
    sessionObjRef.current = null
  }

  return {
    gameState,
    isProcessing,
    error,
    gameHistory,
    startGame,
    revealTile,
    cashout,
    cancelGame,
    destroyExploded,
    resetGame,
  }
}

function parseError(e: any): string {
  const msg: string = e?.message ?? String(e)
  // Handle both "abort code: N" and "MoveAbort(..., N)" dry-run formats
  const match = msg.match(/abort code: (\d+)/) || msg.match(/MoveAbort\(.*?,\s*(\d+)\)/)
  if (match) {
    const code = parseInt(match[1])
    const codes: Record<number, string> = {
      1: '餘額不足',
      2: '押注金額太小',
      3: '押注金額太大',
      4: '遊戲已結束',
      5: '無效格子',
      6: '該格已翻開',
      7: '金庫資金不足，請聯繫管理員',
      8: '平台暫停中',
      9: '所有安全格已翻完，請收手',
      13: '對局尚未超時',
      16: '翻格後無法取消遊戲',
      14: '押注超過單局賠付上限',
    }
    return codes[code] ?? `合約錯誤 (${code})`
  }
  return msg.length > 120 ? msg.slice(0, 120) + '…' : msg
}

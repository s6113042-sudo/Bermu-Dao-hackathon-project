/**
 * useGameSession
 *
 * 管理單局遊戲的完整生命週期。
 * 所有操作均由 session key 靜默執行，無需錢包彈窗。
 *
 * 歷史記錄：遊戲結束後自動儲存至 localStorage，最多保留 5 場。
 */

import { useState, useEffect } from 'react'
import { Transaction } from '@mysten/sui/transactions'
import { GameState, TileState, GameHistory } from '../types/game'
import {
  PACKAGE_ID,
  MODULE_NAME,
  GAME_PLATFORM_ID,
  RANDOM_OBJECT_ID,
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
  tiles: initialTiles(),
  currentMultiplier: 1_000_000_000n,
  safeRevealed: 0,
  revealDigests: [],
}

// ── localStorage helpers ──

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
  } catch {
    // 靜默失敗（私密瀏覽模式可能拒絕寫入）
  }
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
  startGame: (betAmountMist: bigint, playerBalanceId: string) => Promise<void>
  revealTile: (index: number) => Promise<void>
  cashout: (playerBalanceId: string) => Promise<void>
  destroyExploded: () => Promise<void>
  resetGame: () => void
}

export function useGameSession(session: UseSessionKeyResult): UseGameSessionResult {
  const { sessionAddress, executeWithSession } = session
  const [gameState, setGameState] = useState<GameState>(initialState)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameHistory, setGameHistory] = useState<GameHistory[]>(() => loadHistory())

  // 開局時記錄時間戳，用於歷史記錄 id
  const [gameStartTime, setGameStartTime] = useState<number>(0)

  // ── 開始新遊戲（session key，無彈窗）──
  const startGame = async (betAmountMist: bigint, playerBalanceId: string) => {
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      const [gameSession] = tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::start_game`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          tx.object(playerBalanceId),
          tx.pure.u64(betAmountMist),
        ],
      })
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::keep_game`,
        arguments: [gameSession],
      })

      const { effects } = await executeWithSession(tx)

      // 從 effects.created 找 GameSession 對象 ID
      const created = effects?.created ?? []
      const sessionObj = created.find(
        (obj: any) =>
          obj.owner &&
          typeof obj.owner === 'object' &&
          'AddressOwner' in obj.owner &&
          obj.owner.AddressOwner === sessionAddress
      )
      const sessionId: string | null = sessionObj?.reference?.objectId ?? null

      const now = Date.now()
      setGameStartTime(now)
      setGameState({
        ...initialState,
        sessionId,
        phase: 'playing',
        betAmount: betAmountMist,
        tiles: initialTiles(),
      })
    } catch (e: any) {
      setError(parseError(e))
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 揭開格子（session key，無彈窗）──
  const revealTile = async (index: number) => {
    if (gameState.phase !== 'playing' || isProcessing || !gameState.sessionId) return
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::reveal_tile`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          tx.object(gameState.sessionId),
          tx.pure.u64(index),
          tx.object(RANDOM_OBJECT_ID),
        ],
      })

      const { digest, events } = await executeWithSession(tx)

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

          // 儲存爆炸記錄到歷史
          const entry: GameHistory = {
            id: gameStartTime,
            phase: 'exploded',
            digests: newDigests,
            betAmount: prev.betAmount.toString(),
            timestamp: Date.now(),
          }
          const updated = appendHistory(entry)
          setGameHistory(updated)

          return {
            ...prev,
            tiles: newTiles,
            phase: 'exploded',
            currentMultiplier: 0n,
            revealDigests: newDigests,
          }
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

  // ── 收手（session key，無彈窗）──
  const cashout = async (playerBalanceId: string) => {
    if (gameState.phase !== 'playing' || isProcessing || !gameState.sessionId) return
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::cashout`,
        arguments: [
          tx.object(GAME_PLATFORM_ID),
          tx.object(gameState.sessionId),
          tx.object(playerBalanceId),
        ],
      })
      await executeWithSession(tx)

      setGameState((prev) => {
        // 儲存收手記錄到歷史
        const entry: GameHistory = {
          id: gameStartTime,
          phase: 'cashed_out',
          digests: prev.revealDigests,
          betAmount: prev.betAmount.toString(),
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

  // ── 清理爆炸遊戲（session key，無彈窗）──
  const destroyExploded = async () => {
    if (!gameState.sessionId) {
      setGameState(initialState)
      return
    }
    setIsProcessing(true)
    setError(null)
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::destroy_exploded_game`,
        arguments: [tx.object(gameState.sessionId)],
      })
      await executeWithSession(tx)
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
  }

  return {
    gameState,
    isProcessing,
    error,
    gameHistory,
    startGame,
    revealTile,
    cashout,
    destroyExploded,
    resetGame,
  }
}

/** 解析合約 abort code 為可讀訊息 */
function parseError(e: any): string {
  const msg: string = e?.message ?? String(e)
  const match = msg.match(/abort code: (\d+)/)
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
      14: '押注超過單局賠付上限',
    }
    return codes[code] ?? `合約錯誤 (${code})`
  }
  return msg.length > 120 ? msg.slice(0, 120) + '…' : msg
}

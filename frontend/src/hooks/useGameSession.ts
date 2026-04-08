/**
 * useGameSession
 *
 * 管理單局遊戲的完整生命週期：
 *   start_game → reveal_tile × N → cashout / destroy_exploded_game
 *
 * ── 整合待辦 ──
 * 每個函數需建構對應的 PTB（Transaction）並用 useSignAndExecuteTransaction 送出。
 * 結果解析後更新本地 gameState。
 *
 * 目前回傳 mock 狀態和空函數，等待整合。
 */

import { useState } from 'react'
import { GameState, TileState } from '../types/game'
import { GRID_SIZE } from '../lib/constants'

// TODO: 解開以下 import 並實作
// import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
// import { Transaction } from '@mysten/sui/transactions'
// import {
//   PACKAGE_ID, MODULE_NAME, GAME_PLATFORM_ID, RANDOM_OBJECT_ID
// } from '../lib/constants'
// import { usePlayerBalance } from './usePlayerBalance'

// 初始 16 格全為 hidden
function initialTiles(): TileState[] {
  return Array(GRID_SIZE).fill('hidden') as TileState[]
}

// Mock 用：模擬合約的懶惰概率採樣
// P(炸彈) = bombs_remaining / tiles_remaining
function mockIsBomb(bombsLeft: number, tilesLeft: number): boolean {
  return Math.random() < bombsLeft / tilesLeft
}

const initialState: GameState = {
  sessionId: null,
  phase: 'idle',
  betAmount: 0n,
  tiles: initialTiles(),
  currentMultiplier: 1_000_000_000n, // 1.0x
  safeRevealed: 0,
  revealDigests: [],
}

// Mock 用：追蹤剩餘炸彈數和格子數（真實整合後由鏈上事件更新）
interface MockCounters {
  bombsLeft: number
  tilesLeft: number
}

export interface UseGameSessionResult {
  gameState: GameState
  isProcessing: boolean
  startGame: (betAmountMist: bigint) => Promise<void>
  revealTile: (index: number) => Promise<void>
  cashout: () => Promise<void>
  destroyExploded: () => Promise<void>
}

export function useGameSession(): UseGameSessionResult {
  const [gameState, setGameState] = useState<GameState>(initialState)
  const [isProcessing, setIsProcessing] = useState(false)
  // Mock 用計數器（整合後移除，改由鏈上事件驅動）
  const [mockCounters, setMockCounters] = useState<MockCounters>({ bombsLeft: 5, tilesLeft: 16 })

  // ════════════════════════════════════════════════
  // TODO: 整合 startGame
  //
  // 1. 建構 PTB：
  //    const tx = new Transaction()
  //    const [gameSession] = tx.moveCall({
  //      target: `${PACKAGE_ID}::${MODULE_NAME}::start_game`,
  //      arguments: [
  //        tx.object(GAME_PLATFORM_ID),          // platform
  //        tx.object(playerBalanceId),            // player_balance
  //        tx.pure.u64(betAmountMist),            // bet_amount
  //      ],
  //    })
  //    tx.moveCall({
  //      target: `${PACKAGE_ID}::${MODULE_NAME}::keep_game`,
  //      arguments: [gameSession],
  //    })
  //
  // 2. 執行後從 effects.created 取出 GameSession object ID
  // 3. 更新 gameState.phase = 'playing', sessionId, betAmount
  // ════════════════════════════════════════════════
  const startGame = async (betAmountMist: bigint) => {
    setIsProcessing(true)
    try {
      console.warn('[TODO] startGame: 尚未整合，betAmount =', betAmountMist.toString())
      // Mock：進入 playing 狀態，重設計數器
      setMockCounters({ bombsLeft: 5, tilesLeft: 16 })
      setGameState({
        ...initialState,
        sessionId: 'mock-session-id',
        phase: 'playing',
        betAmount: betAmountMist,
        tiles: initialTiles(),
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // ════════════════════════════════════════════════
  // TODO: 整合 revealTile
  //
  // 1. 建構 PTB：
  //    const tx = new Transaction()
  //    tx.moveCall({
  //      target: `${PACKAGE_ID}::${MODULE_NAME}::reveal_tile`,
  //      arguments: [
  //        tx.object(GAME_PLATFORM_ID),           // platform
  //        tx.object(gameState.sessionId!),        // game (mut)
  //        tx.pure.u64(index),                    // tile_index
  //        tx.object(RANDOM_OBJECT_ID),           // rand: &Random (0x8)
  //      ],
  //    })
  //
  // 2. 執行後解析 TileRevealed 事件：
  //    - is_bomb: true → tiles[index] = 'bomb', phase = 'exploded'
  //    - is_bomb: false → tiles[index] = 'safe', 更新 multiplier
  // 3. 儲存 tx digest 到 revealDigests
  // ════════════════════════════════════════════════
  const revealTile = async (index: number) => {
    if (gameState.phase !== 'playing' || isProcessing) return
    setIsProcessing(true)
    try {
      console.warn('[TODO] revealTile: 尚未整合，index =', index)

      const { bombsLeft, tilesLeft } = mockCounters
      const isBomb = mockIsBomb(bombsLeft, tilesLeft)

      if (isBomb) {
        // ── 炸彈！ ──
        setMockCounters((c) => ({ ...c, bombsLeft: c.bombsLeft - 1, tilesLeft: c.tilesLeft - 1 }))
        setGameState((prev) => {
          const newTiles = [...prev.tiles]
          newTiles[index] = 'bomb'
          return {
            ...prev,
            tiles: newTiles,
            phase: 'exploded',
            currentMultiplier: 0n,
            revealDigests: [...prev.revealDigests, `mock-digest-${index}`],
          }
        })
      } else {
        // ── 安全格！更新倍數（模擬合約公式）──
        const newBombsLeft = bombsLeft
        const newTilesLeft = tilesLeft - 1
        setMockCounters({ bombsLeft: newBombsLeft, tilesLeft: newTilesLeft })

        setGameState((prev) => {
          const newTiles = [...prev.tiles]
          newTiles[index] = 'safe'

          // 模擬倍數公式：new = old * tilesLeft / safeLeft * (1 - 0.03)
          const safeLeft = tilesLeft - bombsLeft
          const newMult =
            (prev.currentMultiplier * BigInt(tilesLeft) * 9700n) /
            BigInt(safeLeft) /
            10000n

          // 若已全部翻完安全格，強制收手
          const newSafeRevealed = prev.safeRevealed + 1
          const phase = newSafeRevealed >= 11 ? 'cashed_out' : 'playing'

          return {
            ...prev,
            tiles: newTiles,
            phase,
            safeRevealed: newSafeRevealed,
            currentMultiplier: newMult,
            revealDigests: [...prev.revealDigests, `mock-digest-${index}`],
          }
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // ════════════════════════════════════════════════
  // TODO: 整合 cashout
  //
  // 1. 建構 PTB：
  //    const tx = new Transaction()
  //    tx.moveCall({
  //      target: `${PACKAGE_ID}::${MODULE_NAME}::cashout`,
  //      arguments: [
  //        tx.object(GAME_PLATFORM_ID),
  //        tx.object(gameState.sessionId!),
  //        tx.object(playerBalanceId),
  //      ],
  //    })
  //
  // 2. 成功後：phase = 'cashed_out'，更新 playerBalance
  // ════════════════════════════════════════════════
  const cashout = async () => {
    if (gameState.phase !== 'playing' || isProcessing) return
    setIsProcessing(true)
    try {
      console.warn('[TODO] cashout: 尚未整合')
      setGameState((prev) => ({ ...prev, phase: 'cashed_out' }))
    } finally {
      setIsProcessing(false)
    }
  }

  // ════════════════════════════════════════════════
  // TODO: 整合 destroyExploded
  //
  // 爆炸 → 呼叫 destroy_exploded_game 清理鏈上對象，然後重設為 idle
  //
  //    const tx = new Transaction()
  //    tx.moveCall({
  //      target: `${PACKAGE_ID}::${MODULE_NAME}::destroy_exploded_game`,
  //      arguments: [tx.object(gameState.sessionId!)],
  //    })
  // ════════════════════════════════════════════════
  const destroyExploded = async () => {
    setIsProcessing(true)
    try {
      console.warn('[TODO] destroyExploded: 尚未整合')
      // 重設遊戲狀態
      setGameState(initialState)
    } finally {
      setIsProcessing(false)
    }
  }

  return {
    gameState,
    isProcessing,
    startGame,
    revealTile,
    cashout,
    destroyExploded,
  }
}

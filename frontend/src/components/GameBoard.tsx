import { useState, useEffect, useRef } from 'react'
import { GamePhase, TileState } from '../types/game'

interface GameBoardProps {
  tiles: TileState[]
  phase: GamePhase
  onReveal: (index: number) => Promise<void>
  isProcessing: boolean
}

export default function GameBoard({ tiles, phase, onReveal, isProcessing }: GameBoardProps) {
  const canReveal = phase === 'playing' && !isProcessing
  const [revealingIndex, setRevealingIndex] = useState<number | null>(null)
  // 即時鎖：不依賴 React re-render，防止連點穿透
  const clickLocked = useRef(false)

  // 處理結束後清除 revealingIndex 並解鎖
  useEffect(() => {
    if (!isProcessing) {
      setRevealingIndex(null)
      clickLocked.current = false
    }
  }, [isProcessing])

  const handleClick = async (index: number) => {
    if (!canReveal || tiles[index] !== 'hidden' || clickLocked.current) return
    clickLocked.current = true
    setRevealingIndex(index)
    await onReveal(index)
  }

  return (
    <div
      className="grid gap-3 w-full"
      style={{ gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: '420px' }}
    >
      {tiles.map((state, index) => (
        <Tile
          key={index}
          state={state}
          canReveal={canReveal && state === 'hidden'}
          isRevealing={revealingIndex === index}
          onClick={() => handleClick(index)}
        />
      ))}
    </div>
  )
}

interface TileProps {
  state: TileState
  canReveal: boolean
  isRevealing: boolean
  onClick: () => void
}

function Tile({ state, canReveal, isRevealing, onClick }: TileProps) {
  const stateClass =
    state === 'safe' ? 'tile-safe tile-revealed' :
    state === 'bomb' ? 'tile-bomb tile-revealed' : ''

  const flipClass = isRevealing ? 'tile-flipping' : ''
  const cursorClass = canReveal ? 'cursor-pointer' : 'cursor-default'

  return (
    <button
      onClick={onClick}
      disabled={!canReveal}
      className={`tile ${stateClass} ${flipClass} ${cursorClass} w-full`}
      style={{ minHeight: '90px' }}
    >
      {/* 翻格等待時顯示旋轉問號 */}
      {isRevealing && <RevealingIcon />}
      {!isRevealing && state === 'safe' && <DiamondIcon />}
      {!isRevealing && state === 'bomb' && <BombIcon />}
    </button>
  )
}

function RevealingIcon() {
  return (
    <span
      className="text-2xl select-none"
      style={{
        filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.9))',
        animation: 'spin 0.6s linear infinite',
        display: 'inline-block',
      }}
    >
      ✦
    </span>
  )
}

function DiamondIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="drop-shadow-lg">
      <polygon points="12,2 22,9 18,21 6,21 2,9" fill="#34d399" stroke="#10b981" strokeWidth="1" />
      <polygon points="12,2 17,9 12,16 7,9" fill="#6ee7b7" opacity="0.6" />
    </svg>
  )
}

function BombIcon() {
  return (
    <span
      className="text-3xl select-none"
      style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' }}
    >
      💣
    </span>
  )
}

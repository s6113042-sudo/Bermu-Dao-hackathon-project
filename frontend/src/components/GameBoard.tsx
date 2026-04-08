import { GamePhase, TileState } from '../types/game'

interface GameBoardProps {
  tiles: TileState[]
  phase: GamePhase
  onReveal: (index: number) => void
  isProcessing: boolean
}

export default function GameBoard({ tiles, phase, onReveal, isProcessing }: GameBoardProps) {
  const canReveal = phase === 'playing' && !isProcessing

  return (
    <div
      className="grid gap-3 w-full"
      style={{
        gridTemplateColumns: 'repeat(4, 1fr)',
        maxWidth: '420px',
      }}
    >
      {tiles.map((state, index) => (
        <Tile
          key={index}
          index={index}
          state={state}
          canReveal={canReveal && state === 'hidden'}
          onClick={() => canReveal && state === 'hidden' && onReveal(index)}
        />
      ))}
    </div>
  )
}

// ── 單一格子 ──

interface TileProps {
  index: number
  state: TileState
  canReveal: boolean
  onClick: () => void
}

function Tile({ state, canReveal, onClick }: TileProps) {
  const baseClass = 'tile'

  const stateClass =
    state === 'safe'
      ? 'tile-safe tile-revealed'
      : state === 'bomb'
      ? 'tile-bomb tile-revealed'
      : ''

  const interactiveClass = canReveal ? 'cursor-pointer' : 'cursor-default'

  return (
    <button
      onClick={onClick}
      disabled={!canReveal}
      className={`${baseClass} ${stateClass} ${interactiveClass} w-full`}
      style={{ minHeight: '90px' }}
    >
      {state === 'safe' && <DiamondIcon />}
      {state === 'bomb' && <BombIcon />}
    </button>
  )
}

// ── 圖示元件 ──

function DiamondIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      className="drop-shadow-lg"
    >
      <polygon
        points="12,2 22,9 18,21 6,21 2,9"
        fill="#34d399"
        stroke="#10b981"
        strokeWidth="1"
      />
      <polygon
        points="12,2 17,9 12,16 7,9"
        fill="#6ee7b7"
        opacity="0.6"
      />
    </svg>
  )
}

function BombIcon() {
  return (
    <span className="text-3xl select-none" style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' }}>
      💣
    </span>
  )
}

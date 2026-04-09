import { useCurrentAccount } from '@mysten/dapp-kit'
import { GamePhase } from '../types/game'
import { MIN_BET_SUI, MAX_BET_SUI, MIST_PER_SUI } from '../lib/constants'

interface BetControlsProps {
  betInput: string
  onBetChange: (val: string) => void
  onHalf: () => void
  onDouble: () => void
  onPlay: () => void
  onCashout: () => void
  onDestroyExploded: () => void
  onResetGame: () => void
  phase: GamePhase
  isProcessing: boolean
  revealDigests: string[]
  needsCreate: boolean
  playerBalance: bigint | null
}

export default function BetControls({
  betInput,
  onBetChange,
  onHalf,
  onDouble,
  onPlay,
  onCashout,
  onDestroyExploded,
  onResetGame,
  phase,
  isProcessing,
  needsCreate,
  playerBalance,
}: BetControlsProps) {
  const account = useCurrentAccount()
  const isConnected = !!account

  const betValue = parseFloat(betInput)
  const betMist = isNaN(betValue) ? 0n : BigInt(Math.floor(betValue * Number(MIST_PER_SUI)))
  const isValidBet = !isNaN(betValue) && betValue >= MIN_BET_SUI && betValue <= MAX_BET_SUI
  const insufficientBalance = isConnected && !needsCreate && playerBalance !== null && betMist > playerBalance

  // 只有遊戲進行中（playing）才鎖定輸入框
  const inputDisabled = phase === 'playing' || isProcessing

  const playLabel = (() => {
    if (!isConnected) return '連接錢包'
    if (needsCreate) return '建立帳戶'
    if (insufficientBalance) return '餘額不足'
    return 'Play'
  })()

  const playDisabled = isProcessing || (isConnected && !needsCreate && (!isValidBet || insufficientBalance))

  return (
    <div
      className="panel p-4 flex items-center gap-3 flex-wrap"
      style={{ background: 'rgba(10,10,30,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* ── 下注金額輸入 ── */}
      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
        <SuiIcon />
        <input
          type="number"
          value={betInput}
          onChange={(e) => onBetChange(e.target.value)}
          min={MIN_BET_SUI}
          max={MAX_BET_SUI}
          step="0.01"
          disabled={inputDisabled}
          className="bet-input flex-1"
          placeholder="0.1"
        />
      </div>

      {/* ── 快捷倍率（非遊戲中才顯示）── */}
      {phase !== 'playing' && (
        <>
          <button onClick={onHalf} disabled={isProcessing} className="btn-secondary text-sm px-3 py-2">×0.5</button>
          <button onClick={onDouble} disabled={isProcessing} className="btn-secondary text-sm px-3 py-2">2×</button>
        </>
      )}

      {/* ── 炸彈數量 ── */}
      <div
        className="px-3 py-2 rounded-lg text-sm text-gray-300 font-medium flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        5 Mines
      </div>

      {/* ── 主要動作按鈕 ── */}
      {phase === 'idle' && (
        <button onClick={onPlay} disabled={playDisabled} className="btn-primary flex-shrink-0 min-w-[100px]">
          {isProcessing ? <Spinner /> : playLabel}
        </button>
      )}

      {phase === 'playing' && (
        <button onClick={onCashout} disabled={isProcessing} className="btn-cashout flex-shrink-0 min-w-[100px]">
          {isProcessing ? <Spinner /> : 'Cashout'}
        </button>
      )}

      {phase === 'exploded' && (
        <button onClick={onDestroyExploded} disabled={isProcessing} className="btn-secondary flex-shrink-0 min-w-[100px] text-red-400">
          {isProcessing ? <Spinner /> : '再試一次'}
        </button>
      )}

      {phase === 'cashed_out' && (
        <button onClick={onResetGame} disabled={isProcessing} className="btn-primary flex-shrink-0 min-w-[100px]">
          {isProcessing ? <Spinner /> : '再玩一局'}
        </button>
      )}
    </div>
  )
}

/** Sui 官方 Logo */
function SuiIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <circle cx="41" cy="41" r="41" fill="#6fbcf0" />
      <path
        d="M54.5 28.5C52.8 26 50.5 24.2 47.8 23.3c-2.7-.9-5.7-.9-8.4 0-2.7.9-5 2.7-6.7 5.2L24.5 41c-3.3 4.9-3.3 11.3 0 16.2l4.2 6.2c2 3 5.3 4.7 8.8 4.7h6.6c3.5 0 6.8-1.7 8.8-4.7l4.2-6.2c3.3-4.9 3.3-11.3 0-16.2L54.5 28.5z"
        fill="white"
      />
      <path
        d="M36.5 53.5c1.2 1.8 3.2 2.9 5.4 2.9h3c2.2 0 4.2-1.1 5.4-2.9l3-4.5c2.4-3.5 2.4-8.1 0-11.6l-2.4-3.6c-.5.4-1.1.6-1.8.6-1.7 0-3-1.4-3-3.1 0-.6.2-1.1.4-1.6l-2.1-3.1c-.8-1.2-2.2-2-3.8-2s-3 .8-3.8 2l-2.1 3.1c.2.5.4 1 .4 1.6 0 1.7-1.3 3.1-3 3.1-.7 0-1.3-.2-1.8-.6L28.4 37c-2.4 3.5-2.4 8.1 0 11.6l1.5 2.2 6.6 2.7z"
        fill="#6fbcf0"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin mx-auto" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

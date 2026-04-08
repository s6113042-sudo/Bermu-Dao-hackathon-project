import { useCurrentAccount } from '@mysten/dapp-kit'
import { GamePhase } from '../types/game'
import { MIN_BET_SUI, MAX_BET_SUI } from '../lib/constants'

interface BetControlsProps {
  betInput: string
  onBetChange: (val: string) => void
  onHalf: () => void
  onDouble: () => void
  onPlay: () => void
  onCashout: () => void
  onDestroyExploded: () => void
  phase: GamePhase
  isProcessing: boolean
  revealDigests: string[]
}

export default function BetControls({
  betInput,
  onBetChange,
  onHalf,
  onDouble,
  onPlay,
  onCashout,
  onDestroyExploded,
  phase,
  isProcessing,
}: BetControlsProps) {
  const account = useCurrentAccount()
  const isConnected = !!account

  const betValue = parseFloat(betInput)
  const isValidBet =
    !isNaN(betValue) && betValue >= MIN_BET_SUI && betValue <= MAX_BET_SUI

  return (
    <div
      className="panel p-4 flex items-center gap-3 flex-wrap"
      style={{ background: 'rgba(10,10,30,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* ── 下注金額輸入（僅 idle 狀態可編輯） ── */}
      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
        {/* Sui icon */}
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-400 flex items-center justify-center">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <input
          type="number"
          value={betInput}
          onChange={(e) => onBetChange(e.target.value)}
          min={MIN_BET_SUI}
          max={MAX_BET_SUI}
          step="0.01"
          disabled={phase !== 'idle' || isProcessing}
          className="bet-input flex-1"
          placeholder="0.1"
        />
      </div>

      {/* ── 快捷倍率按鈕（僅 idle） ── */}
      {phase === 'idle' && (
        <>
          <button
            onClick={onHalf}
            disabled={isProcessing}
            className="btn-secondary text-sm px-3 py-2"
          >
            ×.5
          </button>
          <button
            onClick={onDouble}
            disabled={isProcessing}
            className="btn-secondary text-sm px-3 py-2"
          >
            2×
          </button>
        </>
      )}

      {/* ── 固定顯示炸彈數量 ── */}
      <div
        className="px-3 py-2 rounded-lg text-sm text-gray-300 font-medium flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        5 Mines
      </div>

      {/* ── 主要動作按鈕 ── */}
      {phase === 'idle' && (
        /*
         * TODO 整合：
         * 若玩家未有 PlayerBalance 對象，先引導存款
         * startGame 需先確認 PlayerBalance 存在且餘額充足
         */
        <button
          onClick={onPlay}
          disabled={!isConnected || !isValidBet || isProcessing}
          className="btn-primary flex-shrink-0 min-w-[80px]"
        >
          {isProcessing ? <Spinner /> : isConnected ? 'Play' : '連接錢包'}
        </button>
      )}

      {phase === 'playing' && (
        <button
          onClick={onCashout}
          disabled={isProcessing}
          className="btn-cashout flex-shrink-0 min-w-[100px]"
        >
          {isProcessing ? <Spinner /> : 'Cashout'}
        </button>
      )}

      {phase === 'exploded' && (
        /*
         * TODO 整合：
         * destroy_exploded_game 清理鏈上對象後，重設為 idle
         */
        <button
          onClick={onDestroyExploded}
          disabled={isProcessing}
          className="btn-secondary flex-shrink-0 min-w-[100px] text-red-400"
        >
          {isProcessing ? <Spinner /> : '再試一次'}
        </button>
      )}

      {phase === 'cashed_out' && (
        <button
          onClick={() => {
            // reset — useGameSession 內部處理
            onDestroyExploded()
          }}
          disabled={isProcessing}
          className="btn-primary flex-shrink-0 min-w-[100px]"
        >
          再玩一局
        </button>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin mx-auto"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

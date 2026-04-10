import { MULTIPLIER_SCALE, MIST_PER_SUI, RAW_PER_USDC, HOUSE_EDGE_BPS } from '../lib/constants'
import { Currency } from '../types/game'

interface MultiplierDisplayProps {
  multiplier: bigint
  betAmount: bigint
  safeRevealed: number
  currency: Currency
}

export default function MultiplierDisplay({
  multiplier,
  betAmount,
  safeRevealed,
  currency,
}: MultiplierDisplayProps) {
  const unit = currency === 'SUI' ? MIST_PER_SUI : RAW_PER_USDC
  const symbol = currency === 'SUI' ? 'SUI' : 'USDC'
  const decimals = currency === 'SUI' ? 4 : 2

  const fairMult = multiplier > 0n ? Number(multiplier) / Number(MULTIPLIER_SCALE) : 1
  const adjustedMult = fairMult * (1 - HOUSE_EDGE_BPS / 10000)
  const displayMultiplier = adjustedMult.toFixed(4)

  const potentialPayout =
    betAmount > 0n && multiplier > 0n
      ? (Number(betAmount) * adjustedMult) / Number(unit)
      : 0

  return (
    <div
      className="panel px-5 py-4 flex items-center justify-between gap-6"
      style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}
    >
      {/* 已揭開格數 */}
      <div className="text-center">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">已揭開</p>
        <p className="text-white font-bold text-2xl">{safeRevealed}</p>
        <p className="text-gray-500 text-xs">/ 11 格</p>
      </div>

      {/* 中間分隔 */}
      <div className="h-10 w-px bg-white/10" />

      {/* 當前倍數 */}
      <div className="text-center flex-1">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">當前倍數</p>
        <p className="text-purple-400 font-bold text-3xl tracking-tight">
          {displayMultiplier}×
        </p>
      </div>

      {/* 中間分隔 */}
      <div className="h-10 w-px bg-white/10" />

      {/* 若收手可獲得 */}
      <div className="text-center">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">可獲得</p>
        <p className="text-green-400 font-bold text-2xl">
          {potentialPayout.toFixed(decimals)}
        </p>
        <p className="text-gray-500 text-xs">{symbol}</p>
      </div>
    </div>
  )
}

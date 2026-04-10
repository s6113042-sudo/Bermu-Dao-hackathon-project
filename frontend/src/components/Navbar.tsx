import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { useState, useEffect } from 'react'
import { MIST_PER_SUI, RAW_PER_USDC } from '../lib/constants'
import UsdcIcon from './UsdcIcon'
import { UseLotteryResult } from '../hooks/useLottery'

interface NavbarProps {
  suiBalance: bigint | null
  usdcBalance: bigint | null
  balanceLoading: boolean
  onBalanceClick: () => void
  lottery: UseLotteryResult
  onLotteryClick: () => void
}

export default function Navbar({ suiBalance, usdcBalance, balanceLoading, onBalanceClick, lottery, onLotteryClick }: NavbarProps) {
  const account = useCurrentAccount()

  const suiDisplay =
    suiBalance != null
      ? (Number(suiBalance) / Number(MIST_PER_SUI)).toFixed(3)
      : '0.000'

  const usdcDisplay =
    usdcBalance != null
      ? (Number(usdcBalance) / Number(RAW_PER_USDC)).toFixed(2)
      : '0.00'

  const hasWin = !!lottery.winningTicket
  const ticketCount = lottery.myTickets.length
  const nextDrawMs = lottery.lotteryInfo?.nextDrawMs ?? null

  return (
    <header
      className="w-full flex items-center justify-between px-6 py-3"
      style={{ background: 'linear-gradient(90deg, #1e1b4b 0%, #4c1d95 40%, #312e81 70%, #1e1b4b 100%)' }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center gap-3">
        <img
          src="/image (3).jpg"
          alt="Mines Logo"
          className="w-9 h-9 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div>
          <span className="text-white font-bold text-lg tracking-tight">Mines</span>
          <span className="ml-2 text-purple-400 text-xs font-medium uppercase tracking-widest">GameFi</span>
        </div>
      </div>

      {/* ── 右側：抽獎 + 餘額 + 錢包 ── */}
      <div className="flex items-center gap-2">
        {account && (
          <>
            {/* 🎰 抽獎按鈕（緊靠餘額旁） */}
            <button
              onClick={onLotteryClick}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors hover:opacity-80"
              style={{
                background: hasWin ? 'rgba(250,204,21,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${hasWin ? 'rgba(250,204,21,0.5)' : 'rgba(255,255,255,0.1)'}`,
              }}
              title="抽獎系統"
            >
              <span className="text-base leading-none">🎰</span>
              <NavCountdown nextDrawMs={nextDrawMs} hasWin={hasWin} />
              {ticketCount > 0 && (
                <span
                  className="text-xs font-bold leading-none px-1.5 py-0.5 rounded-full"
                  style={{
                    background: hasWin ? 'rgba(250,204,21,0.3)' : 'rgba(139,92,246,0.3)',
                    color: hasWin ? '#fde047' : '#c4b5fd',
                  }}
                >
                  {ticketCount}
                </span>
              )}
              {/* 中獎閃爍點 */}
              {hasWin && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
              )}
            </button>

            {/* 餘額按鈕 */}
            <button
              onClick={onBalanceClick}
              className="flex items-center gap-3 px-4 py-2 rounded-lg transition-colors hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              title="點擊存款 / 提款"
            >
              {balanceLoading ? (
                <span className="text-gray-400 text-sm">...</span>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <SuiIcon />
                    <span className="text-white font-semibold text-sm">{suiDisplay}</span>
                  </div>
                  <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.15)' }} />
                  <div className="flex items-center gap-1.5">
                    <UsdcIcon size={16} />
                    <span className="text-emerald-300 font-semibold text-sm">{usdcDisplay}</span>
                  </div>
                </>
              )}
            </button>
          </>
        )}
        <ConnectButton />
      </div>
    </header>
  )
}

function NavCountdown({ nextDrawMs, hasWin }: { nextDrawMs: number | null; hasWin: boolean }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!nextDrawMs) return
    const update = () => setRemaining(Math.max(0, nextDrawMs - Date.now()))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextDrawMs])

  if (hasWin) {
    return <span className="text-xs font-semibold" style={{ color: '#fde047' }}>中獎！</span>
  }

  if (!nextDrawMs) {
    return <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>抽獎</span>
  }

  const isReady = remaining === 0
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)

  return (
    <span
      className="text-xs font-mono font-semibold"
      style={{ color: isReady ? '#34d399' : '#a78bfa' }}
    >
      {isReady ? '可開獎' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
    </span>
  )
}

function SuiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="41" cy="41" r="41" fill="#6fbcf0" />
      <path d="M54.5 28.5C52.8 26 50.5 24.2 47.8 23.3c-2.7-.9-5.7-.9-8.4 0-2.7.9-5 2.7-6.7 5.2L24.5 41c-3.3 4.9-3.3 11.3 0 16.2l4.2 6.2c2 3 5.3 4.7 8.8 4.7h6.6c3.5 0 6.8-1.7 8.8-4.7l4.2-6.2c3.3-4.9 3.3-11.3 0-16.2L54.5 28.5z" fill="white" />
      <path d="M36.5 53.5c1.2 1.8 3.2 2.9 5.4 2.9h3c2.2 0 4.2-1.1 5.4-2.9l3-4.5c2.4-3.5 2.4-8.1 0-11.6l-2.4-3.6c-.5.4-1.1.6-1.8.6-1.7 0-3-1.4-3-3.1 0-.6.2-1.1.4-1.6l-2.1-3.1c-.8-1.2-2.2-2-3.8-2s-3 .8-3.8 2l-2.1 3.1c.2.5.4 1 .4 1.6 0 1.7-1.3 3.1-3 3.1-.7 0-1.3-.2-1.8-.6L28.4 37c-2.4 3.5-2.4 8.1 0 11.6l1.5 2.2 6.6 2.7z" fill="#6fbcf0" />
    </svg>
  )
}

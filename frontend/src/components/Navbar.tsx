import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { MIST_PER_SUI } from '../lib/constants'

interface NavbarProps {
  balance: bigint | null
  balanceLoading: boolean
  onBalanceClick: () => void
}

export default function Navbar({ balance, balanceLoading, onBalanceClick }: NavbarProps) {
  const account = useCurrentAccount()

  const balanceSUI =
    balance != null
      ? (Number(balance) / Number(MIST_PER_SUI)).toFixed(4)
      : '0.0000'

  return (
    <header className="w-full flex items-center justify-between px-6 py-3" style={{ background: 'linear-gradient(90deg, #1e1b4b 0%, #4c1d95 40%, #312e81 70%, #1e1b4b 100%)' }}>
      {/* ── Logo ── */}
      <div className="flex items-center gap-3">
        <img
          src="/image (3).jpg"
          alt="Mines Logo"
          className="w-9 h-9 object-contain"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div>
          <span className="text-white font-bold text-lg tracking-tight">
            Mines
          </span>
          <span className="ml-2 text-purple-400 text-xs font-medium uppercase tracking-widest">
            GameFi
          </span>
        </div>
      </div>

      {/* ── 右側：餘額 + 錢包按鈕 ── */}
      <div className="flex items-center gap-3">
        {/* PlayerBalance 顯示（連接後可點擊開啟存提款） */}
        {account && (
          <button
            onClick={onBalanceClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            title="點擊存款 / 提款"
          >
            <svg width="18" height="18" viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="41" cy="41" r="41" fill="#6fbcf0" />
              <path d="M54.5 28.5C52.8 26 50.5 24.2 47.8 23.3c-2.7-.9-5.7-.9-8.4 0-2.7.9-5 2.7-6.7 5.2L24.5 41c-3.3 4.9-3.3 11.3 0 16.2l4.2 6.2c2 3 5.3 4.7 8.8 4.7h6.6c3.5 0 6.8-1.7 8.8-4.7l4.2-6.2c3.3-4.9 3.3-11.3 0-16.2L54.5 28.5z" fill="white" />
              <path d="M36.5 53.5c1.2 1.8 3.2 2.9 5.4 2.9h3c2.2 0 4.2-1.1 5.4-2.9l3-4.5c2.4-3.5 2.4-8.1 0-11.6l-2.4-3.6c-.5.4-1.1.6-1.8.6-1.7 0-3-1.4-3-3.1 0-.6.2-1.1.4-1.6l-2.1-3.1c-.8-1.2-2.2-2-3.8-2s-3 .8-3.8 2l-2.1 3.1c.2.5.4 1 .4 1.6 0 1.7-1.3 3.1-3 3.1-.7 0-1.3-.2-1.8-.6L28.4 37c-2.4 3.5-2.4 8.1 0 11.6l1.5 2.2 6.6 2.7z" fill="#6fbcf0" />
            </svg>
            <span className="text-white font-semibold text-sm">
              {balanceLoading ? (
                <span className="text-gray-400">...</span>
              ) : (
                `${balanceSUI} SUI`
              )}
            </span>
          </button>
        )}

        <ConnectButton />
      </div>
    </header>
  )
}

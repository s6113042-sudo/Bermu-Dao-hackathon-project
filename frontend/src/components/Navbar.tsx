import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { MIST_PER_SUI } from '../lib/constants'

interface NavbarProps {
  balance: bigint | null
  balanceLoading: boolean
}

export default function Navbar({ balance, balanceLoading }: NavbarProps) {
  const account = useCurrentAccount()

  const balanceSUI =
    balance != null
      ? (Number(balance) / Number(MIST_PER_SUI)).toFixed(4)
      : '0.0000'

  return (
    <header className="w-full flex items-center justify-between px-6 py-3 bg-navy-800 border-b border-white/5">
      {/* ── Logo ── */}
      <div className="flex items-center gap-3">
        <img
          src="/image (3).jpg"
          alt="Mines Logo"
          className="w-9 h-9 object-contain"
          onError={(e) => {
            // Logo 圖片未放置時顯示 emoji fallback
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
        {/* PlayerBalance 顯示（只在連接後顯示） */}
        {account && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Sui logo */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#6fbcf0">
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-white font-semibold text-sm">
              {balanceLoading ? (
                <span className="text-gray-400">...</span>
              ) : (
                `${balanceSUI} SUI`
              )}
            </span>
          </div>
        )}

        {/* Slush Wallet 連接按鈕（dapp-kit 預設樣式，後續可自訂） */}
        {/*
          TODO: 整合時替換為自訂樣式的連接按鈕
          目前使用 dapp-kit 預設 ConnectButton，已支援 Slush Wallet
        */}
        <ConnectButton />
      </div>
    </header>
  )
}

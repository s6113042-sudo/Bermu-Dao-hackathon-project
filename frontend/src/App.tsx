import { useState, useEffect } from 'react'
import { useCurrentAccount } from '@mysten/dapp-kit'
import Navbar from './components/Navbar'
import GameBoard from './components/GameBoard'
import BetControls from './components/BetControls'
import MultiplierDisplay from './components/MultiplierDisplay'
import InfoModal from './components/InfoModal'
import FairnessModal from './components/FairnessModal'
import BalanceModal from './components/BalanceModal'
import { useSessionKey } from './hooks/useSessionKey'
import { useGameSession } from './hooks/useGameSession'
import { usePlayerBalance } from './hooks/usePlayerBalance'
import { MIST_PER_SUI } from './lib/constants'

export default function App() {
  const account = useCurrentAccount()

  const [showInfo, setShowInfo] = useState(false)
  const [showFairness, setShowFairness] = useState(false)
  const [showBalance, setShowBalance] = useState(false)

  // ── Session Key（所有遊戲操作的靜默簽名者）──
  const session = useSessionKey()

  // ── 遊戲帳戶（PlayerBalance，owned by session address）──
  const playerBalance = usePlayerBalance(session)

  // ── 遊戲狀態 ──
  const game = useGameSession(session)

  // 連接錢包後，若 session 尚無 SUI → 自動開啟充值 Modal
  useEffect(() => {
    if (account && session.sessionSuiBalance === 0n) {
      setShowBalance(true)
    }
  }, [account, session.sessionSuiBalance])

  // 遊戲結束後重新整理遊戲帳戶餘額
  useEffect(() => {
    if (game.gameState.phase === 'cashed_out' || game.gameState.phase === 'exploded') {
      playerBalance.refetch()
    }
  }, [game.gameState.phase])

  // ── 下注金額 ──
  const [betInput, setBetInput] = useState('0.1')
  const betAmountMist = (() => {
    const val = parseFloat(betInput)
    if (isNaN(val) || val <= 0) return 0n
    return BigInt(Math.floor(val * Number(MIST_PER_SUI)))
  })()

  const handleHalfBet = () => {
    const val = parseFloat(betInput)
    if (!isNaN(val)) setBetInput((val / 2).toFixed(4).replace(/\.?0+$/, ''))
  }
  const handleDoubleBet = () => {
    const val = parseFloat(betInput)
    if (!isNaN(val)) setBetInput((val * 2).toFixed(4).replace(/\.?0+$/, ''))
  }

  const handlePlay = () => {
    if (!playerBalance.playerBalanceId) {
      setShowBalance(true)
      return
    }
    game.startGame(betAmountMist, playerBalance.playerBalanceId)
  }

  const handleCashout = () => {
    if (!playerBalance.playerBalanceId) return
    game.cashout(playerBalance.playerBalanceId)
  }

  // 再玩一局：直接用相同押注金額開始下一局，不需要再按 Play
  const handleRestart = () => {
    if (!playerBalance.playerBalanceId) {
      setShowBalance(true)
      return
    }
    game.startGame(betAmountMist, playerBalance.playerBalanceId)
  }

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      <Navbar
        balance={playerBalance.balance}
        balanceLoading={playerBalance.isLoading}
        onBalanceClick={() => account && setShowBalance(true)}
      />

      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-3xl mb-4">
          <p className="text-gray-400 text-sm font-medium">Mines: 5</p>
        </div>

        <div className="w-full max-w-3xl flex justify-center mb-6">
          <GameBoard
            tiles={game.gameState.tiles}
            phase={game.gameState.phase}
            onReveal={game.revealTile}
            isProcessing={game.isProcessing}
          />
        </div>

        {game.gameState.phase === 'playing' && (
          <div className="w-full max-w-3xl mb-4">
            <MultiplierDisplay
              multiplier={game.gameState.currentMultiplier}
              betAmount={game.gameState.betAmount}
              safeRevealed={game.gameState.safeRevealed}
            />
          </div>
        )}

        {game.error && (
          <div
            className="w-full max-w-3xl mb-4 px-4 py-3 rounded-lg text-sm text-red-300"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            {game.error}
          </div>
        )}

        <div className="w-full max-w-3xl mt-auto">
          <div className="flex items-center gap-4 mb-3 px-1">
            <button onClick={() => setShowInfo(true)} className="text-gray-400 hover:text-white transition-colors" title="遊戲說明">
              <InfoIcon />
            </button>
            <button onClick={() => setShowFairness(true)} className="text-gray-400 hover:text-white transition-colors" title="公平性驗證">
              <FairnessIcon />
            </button>
          </div>

          <BetControls
            betInput={betInput}
            onBetChange={setBetInput}
            onHalf={handleHalfBet}
            onDouble={handleDoubleBet}
            onPlay={handlePlay}
            onCashout={handleCashout}
            phase={game.gameState.phase}
            isProcessing={game.isProcessing}
            revealDigests={game.gameState.revealDigests}
            onDestroyExploded={game.destroyExploded}
            onResetGame={handleRestart}
            needsCreate={playerBalance.needsCreate}
            playerBalance={playerBalance.balance}
          />
        </div>
      </main>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {showFairness && (
        <FairnessModal
          onClose={() => setShowFairness(false)}
          revealDigests={game.gameState.revealDigests}
          gameHistory={game.gameHistory}
        />
      )}
      {showBalance && account && (
        <BalanceModal
          session={session}
          playerBalance={playerBalance}
          onClose={() => setShowBalance(false)}
        />
      )}
    </div>
  )
}

function InfoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="16" strokeLinecap="round" />
    </svg>
  )
}

function FairnessIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="3" x2="12" y2="21" strokeLinecap="round" />
      <path d="M6 7l-4 6h8L6 7z" />
      <path d="M18 7l-4 6h8L18 7z" />
      <line x1="4" y1="21" x2="20" y2="21" strokeLinecap="round" />
    </svg>
  )
}

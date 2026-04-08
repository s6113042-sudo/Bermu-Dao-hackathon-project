import { useState } from 'react'
import Navbar from './components/Navbar'
import GameBoard from './components/GameBoard'
import BetControls from './components/BetControls'
import MultiplierDisplay from './components/MultiplierDisplay'
import InfoModal from './components/InfoModal'
import FairnessModal from './components/FairnessModal'
import { useGameSession } from './hooks/useGameSession'
import { usePlayerBalance } from './hooks/usePlayerBalance'
import { MIST_PER_SUI } from './lib/constants'

export default function App() {
  const [showInfo, setShowInfo] = useState(false)
  const [showFairness, setShowFairness] = useState(false)

  // ── 合約 hooks（目前為 stub，整合時替換為真實實作）──
  const { balance, isLoading: balanceLoading } = usePlayerBalance()
  const {
    gameState,
    startGame,
    revealTile,
    cashout,
    destroyExploded,
    isProcessing,
  } = useGameSession()

  // ── 下注金額狀態（SUI 單位字串）──
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
    startGame(betAmountMist)
  }

  const handleCashout = () => {
    cashout()
  }

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      {/* ── 頂部導航列 ── */}
      <Navbar balance={balance} balanceLoading={balanceLoading} />

      {/* ── 頂部漸層裝飾條 ── */}
      <div
        className="w-full h-16"
        style={{
          background:
            'linear-gradient(90deg, #1e1b4b 0%, #4c1d95 40%, #312e81 70%, #1e1b4b 100%)',
        }}
      />

      {/* ── 主要內容區 ── */}
      <main className="flex-1 flex flex-col items-center px-4 py-6">
        {/* Mines 標題 */}
        <div className="w-full max-w-3xl mb-4">
          <p className="text-gray-400 text-sm font-medium">Mines: 5</p>
        </div>

        {/* 遊戲板 */}
        <div className="w-full max-w-3xl flex justify-center mb-6">
          <GameBoard
            tiles={gameState.tiles}
            phase={gameState.phase}
            onReveal={revealTile}
            isProcessing={isProcessing}
          />
        </div>

        {/* 倍數顯示（遊戲中才顯示） */}
        {gameState.phase === 'playing' && (
          <div className="w-full max-w-3xl mb-4">
            <MultiplierDisplay
              multiplier={gameState.currentMultiplier}
              betAmount={gameState.betAmount}
              safeRevealed={gameState.safeRevealed}
            />
          </div>
        )}

        {/* ── 底部工具列 + 控制列 ── */}
        <div className="w-full max-w-3xl mt-auto">
          {/* 工具列圖示 */}
          <div className="flex items-center gap-4 mb-3 px-1">
            <button
              onClick={() => setShowInfo(true)}
              className="text-gray-400 hover:text-white transition-colors"
              title="遊戲說明"
            >
              <InfoIcon />
            </button>
            <button
              onClick={() => setShowFairness(true)}
              className="text-gray-400 hover:text-white transition-colors"
              title="公平性驗證"
            >
              <FairnessIcon />
            </button>
          </div>

          {/* 控制列 */}
          <BetControls
            betInput={betInput}
            onBetChange={setBetInput}
            onHalf={handleHalfBet}
            onDouble={handleDoubleBet}
            onPlay={handlePlay}
            onCashout={handleCashout}
            phase={gameState.phase}
            isProcessing={isProcessing}
            revealDigests={gameState.revealDigests}
            onDestroyExploded={destroyExploded}
          />
        </div>
      </main>

      {/* ── 彈窗 ── */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {showFairness && (
        <FairnessModal
          onClose={() => setShowFairness(false)}
          revealDigests={gameState.revealDigests}
        />
      )}
    </div>
  )
}

// ── 小圖示元件 ──

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

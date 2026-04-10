import { useState, useEffect } from 'react'
import { useCurrentAccount } from '@mysten/dapp-kit'
import Navbar from './components/Navbar'
import GameBoard from './components/GameBoard'
import BetControls from './components/BetControls'
import MultiplierDisplay from './components/MultiplierDisplay'
import InfoModal from './components/InfoModal'
import FairnessModal from './components/FairnessModal'
import BalanceModal from './components/BalanceModal'
import LotteryPanel from './components/LotteryPanel'
import { useSessionKey } from './hooks/useSessionKey'
import { useGameSession } from './hooks/useGameSession'
import { usePlayerBalance } from './hooks/usePlayerBalance'
import { useLottery } from './hooks/useLottery'
import { MIST_PER_SUI, RAW_PER_USDC } from './lib/constants'
import { Currency } from './types/game'

export default function App() {
  const account = useCurrentAccount()

  const [showInfo, setShowInfo] = useState(false)
  const [showFairness, setShowFairness] = useState(false)
  const [showBalance, setShowBalance] = useState(false)
  const [showLottery, setShowLottery] = useState(false)

  const session = useSessionKey()
  const playerBalance = usePlayerBalance(session)
  const game = useGameSession(session)
  const lottery = useLottery(session)

  // 幣種狀態（idle 時可切換，遊戲中鎖定）
  const [currency, setCurrency] = useState<Currency>('SUI')

  // 連接錢包後，若 session 無 SUI → 開啟充值
  useEffect(() => {
    if (account && session.sessionSuiBalance === 0n) {
      setShowBalance(true)
    }
  }, [account, session.sessionSuiBalance])

  // 遊戲結束後連續輪詢確保餘額快速同步
  useEffect(() => {
    const phase = game.gameState.phase
    if (phase === 'cashed_out' || phase === 'exploded') {
      const poll = (fn: () => void) => {
        fn()
        const t1 = setTimeout(fn, 1200)
        const t2 = setTimeout(fn, 3000)
        return () => { clearTimeout(t1); clearTimeout(t2) }
      }
      poll(playerBalance.refetch)
      poll(playerBalance.refetchUSDC)
      lottery.refetch()
    }
  }, [game.gameState.phase])

  // 偵測到中獎彩票時自動領獎（含其他人觸發開獎的情況）
  useEffect(() => {
    if (!lottery.winningTicket || lottery.isBusy) return
    const pbId = playerBalance.playerBalanceId
    if (!pbId) return
    lottery.claimPrize(
      lottery.winningTicket.objectId,
      pbId,
      playerBalance.playerBalanceUSDCId ?? null,
    )
  }, [lottery.winningTicket?.objectId])

  // ── 下注金額 ──
  const [betInput, setBetInput] = useState('0.1')

  const betAmountRaw = (() => {
    const val = parseFloat(betInput)
    if (isNaN(val) || val <= 0) return 0n
    const unit = currency === 'SUI' ? MIST_PER_SUI : RAW_PER_USDC
    return BigInt(Math.floor(val * Number(unit)))
  })()

  const handleHalfBet = () => {
    const val = parseFloat(betInput)
    if (!isNaN(val)) setBetInput((val / 2).toFixed(4).replace(/\.?0+$/, ''))
  }
  const handleDoubleBet = () => {
    const val = parseFloat(betInput)
    if (!isNaN(val)) setBetInput((val * 2).toFixed(4).replace(/\.?0+$/, ''))
  }

  const handleCurrencyChange = (c: Currency) => {
    if (game.gameState.phase !== 'idle') return
    setCurrency(c)
  }

  const handlePlay = () => {
    const pbId = currency === 'SUI'
      ? playerBalance.playerBalanceId
      : playerBalance.playerBalanceUSDCId

    if (!pbId) {
      setShowBalance(true)
      return
    }
    // Pre-check USDC balance before submitting tx
    if (currency === 'USDC') {
      const usdcBal = playerBalance.usdcBalance ?? 0n
      if (usdcBal < betAmountRaw) {
        setShowBalance(true)
        return
      }
    }
    // 樂觀扣除押注，startGame 失敗時自動回滾
    const suiDelta = currency === 'SUI' ? -betAmountRaw : 0n
    const usdcDelta = currency === 'USDC' ? -betAmountRaw : 0n
    playerBalance.adjustOptimistic(suiDelta, usdcDelta)
    game.startGame(betAmountRaw, pbId, currency).catch(() => {
      playerBalance.adjustOptimistic(-suiDelta, -usdcDelta)
    })
  }

  const handleCashout = () => {
    const pbId = game.gameState.currency === 'SUI'
      ? playerBalance.playerBalanceId
      : playerBalance.playerBalanceUSDCId
    if (!pbId) return
    game.cashout(pbId)
  }

  const handleCancel = () => {
    const pbId = game.gameState.currency === 'SUI'
      ? playerBalance.playerBalanceId
      : playerBalance.playerBalanceUSDCId
    if (!pbId) return
    game.cancelGame(pbId)
  }

  const handleRestart = () => {
    game.resetGame()
  }

  // 遊戲中使用的幣種（從 gameState 取，避免切換後不一致）
  const activeCurrency = game.gameState.phase !== 'idle'
    ? game.gameState.currency
    : currency

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      <Navbar
        suiBalance={playerBalance.balance}
        usdcBalance={playerBalance.usdcBalance}
        balanceLoading={playerBalance.isLoading || playerBalance.usdcLoading}
        onBalanceClick={() => account && setShowBalance(true)}
        lottery={lottery}
        onLotteryClick={() => setShowLottery(true)}
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
              currency={activeCurrency}
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
            onCancel={handleCancel}
            phase={game.gameState.phase}
            isProcessing={game.isProcessing}
            revealDigests={game.gameState.revealDigests}
            onDestroyExploded={game.destroyExploded}
            onResetGame={handleRestart}
            needsCreate={playerBalance.needsCreate}
            playerBalance={playerBalance.balance}
            safeRevealed={game.gameState.safeRevealed}
            currency={activeCurrency}
            onCurrencyChange={handleCurrencyChange}
            usdcBalance={playerBalance.usdcBalance}
            needsCreateUSDC={playerBalance.needsCreateUSDC}
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
      {showLottery && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setShowLottery(false)}
        >
          <div
            className="absolute right-4 w-96"
            style={{ top: '60px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 小三角箭頭 */}
            <div className="flex justify-end pr-6">
              <div style={{
                width: 0, height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderBottom: '8px solid rgba(139,92,246,0.5)',
              }} />
            </div>
            <LotteryPanel
              lottery={lottery}
              isWalletConnected={!!account}
              onClose={() => setShowLottery(false)}
              playerBalanceId={playerBalance.playerBalanceId}
              playerBalanceUSDCId={playerBalance.playerBalanceUSDCId}
            />
          </div>
        </div>
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

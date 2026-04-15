import { useState, useEffect, type ReactNode } from 'react'
import { UseLotteryResult } from '../hooks/useLottery'
import { MIST_PER_SUI, RAW_PER_USDC } from '../lib/constants'
import { LotteryTicket } from '../types/game'

interface LotteryPanelProps {
  lottery: UseLotteryResult
  isWalletConnected: boolean
  onClose?: () => void
  playerBalanceId?: string | null
  playerBalanceUSDCId?: string | null
}

export default function LotteryPanel({ lottery, isWalletConnected, onClose, playerBalanceId, playerBalanceUSDCId }: LotteryPanelProps) {
  const { lotteryInfo, lotteryLoading, myTickets, winningTickets, triggerLottery, discardAllOld, claimAllPrizes, isBusy, lotteryError } = lottery
  const [showRules, setShowRules] = useState(false)
  const [remaining, setRemaining] = useState(0)

  const currentRound = lotteryInfo?.round ?? 0

  // 倒數計時
  useEffect(() => {
    if (!lotteryInfo?.nextDrawMs) return
    const update = () => setRemaining(Math.max(0, lotteryInfo.nextDrawMs - Date.now()))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [lotteryInfo?.nextDrawMs])

  const prizePoolSui  = lotteryInfo ? (Number(lotteryInfo.prizePoolSui)  / Number(MIST_PER_SUI)).toFixed(3) : '0.000'
  const prizePoolUsdc = lotteryInfo ? (Number(lotteryInfo.prizePoolUsdc) / Number(RAW_PER_USDC)).toFixed(2) : '0.00'

  // 分組：本輪 vs 舊彩票
  const currentTickets = myTickets.filter(t => t.round === currentRound)
  const oldTickets     = myTickets.filter(t => t.round < currentRound)
  const winningIds     = new Set(winningTickets.map(t => t.objectId))
  // 舊彩票中可回收的（排除所有中獎彩票）
  const recyclableIds  = oldTickets
    .filter(t => !winningIds.has(t.objectId))
    .map(t => t.objectId)

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(160deg, #1a1040 0%, #0f0a2e 100%)',
        border: '1px solid rgba(139,92,246,0.35)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.15)',
      }}
    >
      {/* ── 頂部標題列 ── */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.08)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🎰</span>
          <div>
            <p className="text-white font-bold text-sm leading-tight">每輪抽獎</p>
            <p className="text-purple-400 text-xs">每 20 分鐘開獎一次</p>
          </div>
          {lotteryInfo && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd' }}
            >
              #{lotteryInfo.round}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRules(true)}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors hover:opacity-80"
            style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.4)' }}
            title="抽獎規則"
          >
            i
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
              title="關閉"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── 可滾動內容區 ── */}
      <div
        className="overflow-y-auto px-5 pt-5 flex flex-col gap-4"
        style={{ maxHeight: '52vh', scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.3) transparent' }}
      >
        {/* ── 獎池卡片 ── */}
        <div className="grid grid-cols-2 gap-3">
          <PrizeBox label="SUI 獎池" value={prizePoolSui}  symbol="SUI"  color="#6fbcf0" loading={lotteryLoading} icon="💧" />
          <PrizeBox label="USDC 獎池" value={prizePoolUsdc} symbol="USDC" color="#34d399" loading={lotteryLoading} icon="💵" />
        </div>

        {/* ── 本輪統計列 ── */}
        {lotteryInfo && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-1.5 text-gray-400">
              <span>🎟️</span>
              <span>本輪共</span>
              <span className="text-white font-bold">{lotteryInfo.ticketCount}</span>
              <span>張彩票參與抽獎</span>
            </div>
            {currentTickets.length > 0 && (
              <span className="font-medium" style={{ color: '#c4b5fd' }}>
                我有 {currentTickets.length} 張
              </span>
            )}
          </div>
        )}

        {/* ── 上輪未中獎提示 ── */}
        {oldTickets.length > 0 && winningTickets.length === 0 && (
          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.2)' }}
          >
            <div className="flex items-center gap-2 text-gray-400">
              <span>😔</span>
              <span>舊彩票 <span className="text-gray-300 font-medium">{oldTickets.length}</span> 張未中獎</span>
            </div>
            {recyclableIds.length > 0 && (
              <button
                onClick={() => discardAllOld(recyclableIds)}
                disabled={isBusy}
                className="text-xs px-2.5 py-1 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                {isBusy ? <Spinner /> : '回收押金'}
              </button>
            )}
          </div>
        )}

        {/* ── 中獎區塊 ── */}
        {winningTickets.length === 1 && (
          <WinningBanner
            ticket={winningTickets[0]}
            lottery={lottery}
            isBusy={isBusy}
            playerBalanceId={playerBalanceId}
            playerBalanceUSDCId={playerBalanceUSDCId}
          />
        )}
        {winningTickets.length > 1 && (
          <WinningBannerMulti
            tickets={winningTickets}
            onClaimAll={() => {
              if (playerBalanceId) claimAllPrizes(winningTickets.map(t => t.objectId), playerBalanceId, playerBalanceUSDCId ?? null)
            }}
            isBusy={isBusy}
            hasBalance={!!playerBalanceId}
          />
        )}

        {/* 底部間距 */}
        <div className="h-1" />
      </div>

      {/* ── 固定底部：觸發開獎 + 錯誤訊息 ── */}
      <div
        className="px-5 pb-5 pt-3 flex flex-col gap-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {isWalletConnected && (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={triggerLottery}
              disabled={isBusy || remaining > 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: remaining > 0 ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.15)',
                border: `1px solid ${remaining > 0 ? 'rgba(255,255,255,0.1)' : 'rgba(139,92,246,0.35)'}`,
                color: remaining > 0 ? '#6b7280' : '#c4b5fd',
              }}
            >
              {isBusy ? <Spinner /> : remaining > 0 ? '等待開獎時間…' : '觸發開獎（任何人皆可）'}
            </button>
            {remaining > 0 && !isBusy && (
              <p className="text-xs text-center" style={{ color: '#6b7280' }}>
                距離下次開獎還有{' '}
                <span style={{ color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>
                  {String(Math.floor(remaining / 60000)).padStart(2, '0')}:
                  {String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}
                </span>
                ，倒數結束後才可觸發
              </p>
            )}
          </div>
        )}

        {lotteryError && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <span>⚠️</span>
            <span className="text-red-400">{lotteryError}</span>
          </div>
        )}
      </div>

      {/* ── 規則說明彈窗 ── */}
      {showRules && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowRules(false)}
        >
          <div
            className="rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4"
            style={{
              background: 'linear-gradient(160deg, #1a1040 0%, #0f0a2e 100%)',
              border: '1px solid rgba(139,92,246,0.4)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎰</span>
                <span className="text-white font-bold">抽獎系統規則</span>
              </div>
              <button onClick={() => setShowRules(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <RuleItem icon="🎟️" title="如何獲得彩票">
                每完成一局遊戲（不論輸贏）自動獲得一張彩票，無需額外操作。
              </RuleItem>
              <RuleItem icon="⏱️" title="開獎時間">
                每 20 分鐘開獎一次。倒數計時結束後，任何人皆可按「觸發開獎」按鈕啟動抽獎。
              </RuleItem>
              <RuleItem icon="🏆" title="中獎規則">
                系統從本輪所有彩票中隨機抽出一張，中獎者可領取本輪全部 SUI + USDC 獎池獎金。
              </RuleItem>
              <RuleItem icon="💰" title="獎池來源">
                每局遊戲結束，平台從莊家利潤中抽取 5% 注入獎池。SUI 遊戲進 SUI 獎池，USDC 遊戲進 USDC 獎池。
              </RuleItem>
              <RuleItem icon="🗑️" title="舊彩票處理">
                開獎後非中獎彩票自動失效，可點擊「回收押金」手動刪除並回收儲存押金。
              </RuleItem>
            </div>

            <button
              onClick={() => setShowRules(false)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ── 獎池卡片 ──
function PrizeBox({ label, value, symbol, color, loading, icon }: {
  label: string; value: string; symbol: string; color: string; loading: boolean; icon: string
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span className="text-gray-500 text-xs">{label}</span>
      </div>
      <span className="font-bold text-lg leading-none" style={{ color }}>
        {loading ? <span className="text-gray-600 text-sm">載入中…</span> : value}
      </span>
      {!loading && <span className="text-gray-600 text-xs">{symbol}</span>}
    </div>
  )
}


// ── 規則條目 ──
function RuleItem({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-purple-300 font-semibold text-xs mb-0.5">{title}</p>
        <p className="text-gray-400 text-xs leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

// ── 中獎橫幅（單張中獎票） ──
function WinningBanner({ ticket, lottery, isBusy, playerBalanceId, playerBalanceUSDCId }: {
  ticket: LotteryTicket
  lottery: UseLotteryResult
  isBusy: boolean
  playerBalanceId?: string | null
  playerBalanceUSDCId?: string | null
}) {
  const [claiming, setClaiming] = useState(false)

  const handleClaim = async () => {
    if (!playerBalanceId) return
    setClaiming(true)
    try {
      await lottery.claimPrize(ticket.objectId, playerBalanceId, playerBalanceUSDCId ?? null)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div
      className="rounded-xl p-4 flex items-center justify-between gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(250,204,21,0.12), rgba(217,119,6,0.08))',
        border: '1px solid rgba(250,204,21,0.35)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏆</span>
        <div>
          <p className="text-yellow-300 font-bold text-sm">第 {ticket.round} 輪中獎！</p>
          <p className="text-yellow-600 text-xs">票號 #{ticket.ticketNumber}・點擊領取獎金</p>
        </div>
      </div>
      {(isBusy || claiming) ? (
        <Spinner />
      ) : (
        <button
          onClick={handleClaim}
          disabled={!playerBalanceId}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: 'rgba(250,204,21,0.2)', color: '#fde68a', border: '1px solid rgba(250,204,21,0.4)' }}
        >
          領獎
        </button>
      )}
    </div>
  )
}

// ── 多輪中獎整合卡片 ──
function WinningBannerMulti({ tickets, onClaimAll, isBusy, hasBalance }: {
  tickets: LotteryTicket[]
  onClaimAll: () => void
  isBusy: boolean
  hasBalance: boolean
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(250,204,21,0.12), rgba(217,119,6,0.08))',
        border: '1px solid rgba(250,204,21,0.35)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏆</span>
        <div>
          <p className="text-yellow-300 font-bold text-sm">恭喜！共 {tickets.length} 輪中獎</p>
          <p className="text-yellow-600 text-xs">
            {tickets.map(t => `第 ${t.round} 輪 #${t.ticketNumber}`).join('、')}
          </p>
        </div>
      </div>
      <button
        onClick={onClaimAll}
        disabled={isBusy || !hasBalance}
        className="w-full py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{ background: 'rgba(250,204,21,0.2)', color: '#fde68a', border: '1px solid rgba(250,204,21,0.4)' }}
      >
        {isBusy ? <Spinner /> : `一鍵領取全部 ${tickets.length} 輪獎金`}
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin mx-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

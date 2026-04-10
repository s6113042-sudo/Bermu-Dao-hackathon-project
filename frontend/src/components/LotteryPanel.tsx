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
  const { lotteryInfo, lotteryLoading, myTickets, winningTicket, triggerLottery, claimPrize, discardTicket, discardAllOld, isBusy, lotteryError } = lottery
  const [showTickets, setShowTickets] = useState(false)
  const [showRules, setShowRules] = useState(false)

  const currentRound = lotteryInfo?.round ?? 0

  const prizePoolSui  = lotteryInfo ? (Number(lotteryInfo.prizePoolSui)  / Number(MIST_PER_SUI)).toFixed(3) : '0.000'
  const prizePoolUsdc = lotteryInfo ? (Number(lotteryInfo.prizePoolUsdc) / Number(RAW_PER_USDC)).toFixed(2) : '0.00'

  // 分組：本輪 vs 舊彩票
  const currentTickets = myTickets.filter(t => t.round === currentRound)
  const oldTickets     = myTickets.filter(t => t.round < currentRound)
  // 舊彩票中可回收的（排除中獎彩票）
  const recyclableIds  = oldTickets
    .filter(t => t.objectId !== winningTicket?.objectId)
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
          <Countdown nextDrawMs={lotteryInfo?.nextDrawMs ?? null} />
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

      <div className="p-5 flex flex-col gap-4">
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
            {myTickets.length > 0 && (
              <button
                onClick={() => setShowTickets(!showTickets)}
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors font-medium"
              >
                我的 {myTickets.length} 張
                <span style={{ fontSize: 10 }}>{showTickets ? '▲' : '▼'}</span>
              </button>
            )}
          </div>
        )}

        {/* ── 我的彩票（分本輪／舊票） ── */}
        {showTickets && myTickets.length > 0 && (
          <div className="flex flex-col gap-3">

            {/* 本輪彩票 */}
            {currentTickets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-purple-400 text-xs font-semibold">本輪彩票</span>
                  <span className="text-gray-600 text-xs">· 開獎前不可回收</span>
                </div>
                {currentTickets.map(ticket => (
                  <TicketRow
                    key={ticket.objectId}
                    ticket={ticket}
                    isWinner={false}
                    canDiscard={false}
                    onDiscard={() => {}}
                    isBusy={isBusy}
                  />
                ))}
              </div>
            )}

            {/* 舊彩票 */}
            {oldTickets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs font-semibold">上輪彩票</span>
                    {recyclableIds.length > 0 && (
                      <span className="text-gray-600 text-xs">· 未中獎可回收儲存押金</span>
                    )}
                  </div>
                  {recyclableIds.length > 1 && (
                    <button
                      onClick={() => discardAllOld(recyclableIds)}
                      disabled={isBusy}
                      className="text-xs px-2 py-0.5 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      一鍵回收全部
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.3) transparent' }}
                >
                  {oldTickets.map(ticket => {
                    const isWin = winningTicket?.objectId === ticket.objectId
                    return (
                      <TicketRow
                        key={ticket.objectId}
                        ticket={ticket}
                        isWinner={isWin}
                        canDiscard={!isWin}
                        onDiscard={() => discardTicket(ticket.objectId)}
                        isBusy={isBusy}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 中獎橫幅 ── */}
        {winningTicket && (
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(250,204,21,0.12), rgba(217,119,6,0.08))',
              border: '1px solid rgba(250,204,21,0.35)',
            }}
          >
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-yellow-300 font-bold text-sm">恭喜中獎！</p>
              <p className="text-yellow-500 text-xs">獎金正在自動存入您的遊戲餘額…</p>
            </div>
            {isBusy && <Spinner />}
          </div>
        )}

        {/* ── 觸發開獎 ── */}
        {isWalletConnected && (
          <button
            onClick={triggerLottery}
            disabled={isBusy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.35)',
              color: '#c4b5fd',
            }}
          >
            {isBusy ? <Spinner /> : '觸發開獎（任何人皆可）'}
          </button>
        )}

        {/* ── 錯誤訊息 ── */}
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
                開獎後非中獎彩票自動失效，可點擊彩票列表中的 ✕ 手動刪除並回收儲存押金。
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

// ── 倒數計時器 ──
function Countdown({ nextDrawMs }: { nextDrawMs: number | null }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!nextDrawMs) return
    const update = () => setRemaining(Math.max(0, nextDrawMs - Date.now()))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextDrawMs])

  if (!nextDrawMs) return null

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const isReady = remaining === 0

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: isReady ? 'rgba(52,211,153,0.15)' : 'rgba(139,92,246,0.15)',
        border: `1px solid ${isReady ? 'rgba(52,211,153,0.4)' : 'rgba(139,92,246,0.3)'}`,
      }}
    >
      <span style={{ fontSize: 10 }}>{isReady ? '🟢' : '⏱'}</span>
      <span
        className="text-xs font-mono font-bold"
        style={{ color: isReady ? '#34d399' : '#a78bfa' }}
      >
        {isReady ? '可開獎' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
      </span>
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

// ── 彩票列 ──
function TicketRow({ ticket, isWinner, canDiscard, onDiscard, isBusy }: {
  ticket: LotteryTicket; isWinner: boolean; canDiscard: boolean; onDiscard: () => void; isBusy: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
      style={{
        background: isWinner ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isWinner ? 'rgba(250,204,21,0.3)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: isWinner ? '#fde047' : '#a78bfa' }}>🎟️</span>
        <span className="text-gray-300">票號 #{ticket.ticketNumber}</span>
        {isWinner && <span className="text-yellow-400 font-bold">中獎 🏆</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600">R{ticket.round}</span>
        {canDiscard && (
          <button
            onClick={onDiscard}
            disabled={isBusy}
            className="text-gray-600 hover:text-red-400 transition-colors w-5 h-5 flex items-center justify-center rounded hover:bg-red-400/10"
            title="回收此彩票（取回儲存押金）"
          >
            ✕
          </button>
        )}
      </div>
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

function Spinner() {
  return (
    <svg className="animate-spin mx-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

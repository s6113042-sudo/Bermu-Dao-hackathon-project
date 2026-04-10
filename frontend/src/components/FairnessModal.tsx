import { useState } from 'react'
import { explorerTx } from '../lib/constants'
import { GameHistory } from '../types/game'

interface FairnessModalProps {
  onClose: () => void
  revealDigests: string[]
  gameHistory: GameHistory[]
}

type Tab = 'current' | 'history'

export default function FairnessModal({ onClose, revealDigests, gameHistory }: FairnessModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('current')

  // 歷史記錄排除最新這場（最新那場就是本局，顯示在「本局」tab）
  // gameHistory[0] 是最新的，所以歷史顯示 [1..9]（最多 9 場）
  const historyGames = gameHistory.slice(1, 10)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel p-6 max-w-lg w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#1a1a35', border: '1px solid rgba(124,58,237,0.3)' }}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BalanceIcon />
            <h2 className="text-white font-bold text-xl">公平性驗證</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="h-px bg-white/10 mb-4" />

        {/* 機制說明 */}
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed mb-4">
          <p>
            本遊戲的隨機性由 <span className="text-purple-400 font-medium">Sui 區塊鏈驗證者共識</span> 保障，
            採用 BLS 門限簽名生成每個 Epoch 的隨機種子，任何單一驗證者均無法預測或操控結果。
          </p>
          <p>
            每次翻格子均為獨立的鏈上交易，結果不可撤銷，並永久記錄在區塊鏈上。
          </p>
        </div>

        {/* Tab 切換 */}
        <div
          className="flex mb-4 rounded-lg overflow-hidden flex-shrink-0"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <TabButton
            label="本局記錄"
            active={activeTab === 'current'}
            onClick={() => setActiveTab('current')}
          />
          <TabButton
            label={`歷史記錄${historyGames.length > 0 ? ` (${historyGames.length})` : ''}`}
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
          />
        </div>

        {/* Tab 內容 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === 'current' ? (
            <CurrentTab revealDigests={revealDigests} />
          ) : (
            <HistoryTab games={historyGames} />
          )}
        </div>

        <button onClick={onClose} className="btn-secondary w-full mt-5 flex-shrink-0">
          關閉
        </button>
      </div>
    </div>
  )
}

// ── 本局 Tab ──

function CurrentTab({ revealDigests }: { revealDigests: string[] }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-medium">
        本局翻格交易記錄
      </p>
      {revealDigests.length === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          尚未翻開任何格子
        </div>
      ) : (
        <div className="space-y-2">
          {revealDigests.map((digest, i) => (
            <DigestRow key={digest} index={i + 1} digest={digest} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── 歷史 Tab ──

function HistoryTab({ games }: { games: GameHistory[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  if (games.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        尚無歷史記錄
        <p className="text-xs mt-1 text-gray-600">完成遊戲後將自動保存最近 9 場</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 說明 */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs text-gray-400 leading-relaxed"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}
      >
        <p className="font-medium text-purple-300 mb-1">如何驗證公平性？</p>
        <p>每場遊戲的每次翻格均對應一筆獨立的鏈上交易。點擊哈希值可在 Sui Explorer 查看完整交易記錄，包含 Sui Random 模組產生的隨機種子，確認結果不可被篡改。</p>
        <p className="mt-1">本頁保留最近 <span className="text-purple-300">10 場</span>記錄（含本局），資料存儲於瀏覽器本機。</p>
      </div>
      {games.map((game, idx) => {
        const isExpanded = expandedId === game.id
        const date = new Date(game.timestamp)
        const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        const isSUI = !game.currency || game.currency === 'SUI'
        const betDisplay = isSUI
          ? (parseInt(game.betAmount) / 1_000_000_000).toFixed(3) + ' SUI'
          : (parseInt(game.betAmount) / 1_000_000).toFixed(2) + ' USDC'
        const resultColor = game.phase === 'cashed_out' ? 'text-green-400' : 'text-red-400'
        const resultLabel = game.phase === 'cashed_out' ? '收手' : '爆炸'

        return (
          <div
            key={game.id}
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {/* 場次標題列（可展開） */}
            <button
              className="w-full flex items-center justify-between px-3 py-2 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}
              onClick={() => setExpandedId(isExpanded ? null : game.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-xs w-5">#{idx + 1}</span>
                <span className={`text-xs font-medium ${resultColor}`}>{resultLabel}</span>
                <span className="text-gray-300 text-xs">{betDisplay}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">{timeStr}</span>
                <span className="text-gray-500 text-xs">{game.digests.length} 格</span>
                <ChevronIcon expanded={isExpanded} />
              </div>
            </button>

            {/* 展開的 digest 列表 */}
            {isExpanded && (
              <div className="px-3 py-2 space-y-1.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
                {game.digests.length === 0 ? (
                  <p className="text-xs text-gray-600 py-1">本局未翻任何格子</p>
                ) : (
                  game.digests.map((digest, i) => (
                    <DigestRow key={digest} index={i + 1} digest={digest} />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 共用元件 ──

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 text-sm font-medium transition-colors"
      style={{
        background: active ? 'rgba(124,58,237,0.25)' : 'transparent',
        color: active ? '#a78bfa' : '#9ca3af',
      }}
    >
      {label}
    </button>
  )
}

function DigestRow({ index, digest }: { index: number; digest: string }) {
  return (
    <a
      href={explorerTx(digest)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-2.5 rounded-lg transition-colors group"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs w-5">#{index}</span>
        <span className="text-gray-300 text-xs font-mono group-hover:text-purple-400 transition-colors">
          {digest.slice(0, 20)}...{digest.slice(-8)}
        </span>
      </div>
      <ExternalLinkIcon />
    </a>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-gray-500 transition-transform"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function BalanceIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
      <line x1="12" y1="3" x2="12" y2="21" strokeLinecap="round" />
      <path d="M6 7l-4 6h8L6 7z" />
      <path d="M18 7l-4 6h8L18 7z" />
      <line x1="4" y1="21" x2="20" y2="21" strokeLinecap="round" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className="text-gray-500 group-hover:text-purple-400 transition-colors flex-shrink-0">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

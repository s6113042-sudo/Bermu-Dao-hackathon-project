import { explorerTx } from '../lib/constants'

interface FairnessModalProps {
  onClose: () => void
  revealDigests: string[]
}

export default function FairnessModal({ onClose, revealDigests }: FairnessModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel p-6 max-w-lg w-full mx-4"
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
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            本遊戲的隨機性由 <span className="text-purple-400 font-medium">Sui 區塊鏈驗證者共識</span> 保障，
            採用 BLS 門限簽名生成每個 Epoch 的隨機種子，任何單一驗證者均無法預測或操控結果。
          </p>
          <p>
            每次翻格子均為獨立的鏈上交易，結果不可撤銷，並永久記錄在區塊鏈上。
            你可以透過以下交易哈希在 Sui Explorer 查詢每一次翻格的完整記錄。
          </p>
        </div>

        {/* 交易記錄 */}
        <div className="mt-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-medium">
            本局翻格交易記錄
          </p>

          {revealDigests.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              尚未翻開任何格子
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {revealDigests.map((digest, i) => (
                <a
                  key={digest}
                  href={explorerTx(digest)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg transition-colors group"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-5">#{i + 1}</span>
                    <span className="text-gray-300 text-xs font-mono group-hover:text-purple-400 transition-colors">
                      {digest.slice(0, 20)}...{digest.slice(-8)}
                    </span>
                  </div>
                  <ExternalLinkIcon />
                </a>
              ))}
            </div>
          )}
        </div>

        <button onClick={onClose} className="btn-secondary w-full mt-5">
          關閉
        </button>
      </div>
    </div>
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

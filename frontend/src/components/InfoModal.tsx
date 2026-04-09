interface InfoModalProps {
  onClose: () => void
}

export default function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#1a1a35', border: '1px solid rgba(124,58,237,0.3)' }}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💣</span>
            <h2 className="text-white font-bold text-xl">踩地雷</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="h-px bg-white/10 mb-4" />

        <p className="text-gray-300 text-sm leading-relaxed">
          4×4 格子，隱藏 5 枚地雷。每揭開一個安全格，倍率遞增。隨時收手按當前倍率結算；踩到地雷押注全失。
        </p>

        <div className="mt-4 space-y-2">
          <RuleItem icon="🎯" text="16 格中藏 5 枚地雷，11 個安全格" />
          <RuleItem icon="💎" text="每揭一格安全格，賠率倍數提升" />
          <RuleItem icon="💥" text="觸發地雷：押注全數歸零" />
          <RuleItem icon="💰" text="Cashout：按當前倍率立即結算" />
          <RuleItem icon="🎲" text="隨機性由 Sui 鏈上 Random 模組保障" />
        </div>

        <button onClick={onClose} className="btn-primary w-full mt-6">
          開始遊戲
        </button>
      </div>
    </div>
  )
}

function RuleItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-300">
      <span className="text-base">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

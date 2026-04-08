interface InfoModalProps {
  onClose: () => void
}

export default function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#1a1a35', border: '1px solid rgba(124,58,237,0.3)' }}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💣</span>
            <h2 className="text-white font-bold text-xl">踩地雷</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* 分隔線 */}
        <div className="h-px bg-white/10 mb-4" />

        {/* 說明文字 */}
        <p className="text-gray-300 text-sm leading-relaxed">
          踩地雷是戰略的傑作，玩家在尋找隱藏寶藏的同時要謹慎揭開方格，因為隱藏的地雷可能隨時結束你的探險。每次揭開都會增加風險，為勇敢的玩家帶來充滿懸念和精心計算風險的心跳體驗，保證一場難忘的遊戲冒險。
        </p>

        {/* 規則列表 */}
        <div className="mt-5 space-y-2">
          <RuleItem icon="🎯" text="4×4 格子，隱藏 5 枚地雷" />
          <RuleItem icon="💎" text="每揭開一個安全格，賠率倍數上升" />
          <RuleItem icon="💥" text="觸發地雷：押注全數歸零" />
          <RuleItem icon="💰" text="隨時收手，按當前倍數結算獎勵" />
        </div>

        <button
          onClick={onClose}
          className="btn-primary w-full mt-6"
        >
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

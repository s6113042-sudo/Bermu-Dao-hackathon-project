/**
 * USDC Token Icon — Circle 官方藍色圓形設計
 * 使用 Circle 品牌色 #2775CA + 白色美元符號，清晰辨識
 */

interface UsdcIconProps {
  size?: number
  className?: string
}

export default function UsdcIcon({ size = 22, className = '' }: UsdcIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
    >
      {/* 藍色背景圓 */}
      <circle cx="16" cy="16" r="16" fill="#2775CA" />

      {/* 白色內圓（留邊框感） */}
      <circle cx="16" cy="16" r="12.5" stroke="white" strokeWidth="1.2" strokeOpacity="0.3" fill="none" />

      {/* 美元符號本體（寬 S 形） */}
      <path
        d="M19.2 13.4c0-1.8-1.4-3-3.2-3s-3.2 1.2-3.2 3c0 1.6 1 2.5 3.2 3 2.2.5 3.2 1.4 3.2 3 0 1.8-1.4 3-3.2 3s-3.2-1.2-3.2-3"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* 豎線上段 */}
      <line x1="16" y1="8.5" x2="16" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />

      {/* 豎線下段 */}
      <line x1="16" y1="21" x2="16" y2="23.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

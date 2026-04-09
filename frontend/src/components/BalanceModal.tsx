/**
 * BalanceModal — 充值 / 提款
 *
 * 用戶只看到「遊戲餘額」一個概念。
 * 充值 = 一次錢包授權，錢直接進入遊戲餘額可立即使用。
 * 提款 = 無需授權，直接從遊戲餘額退回。
 */

import { useState } from 'react'
import { MIST_PER_SUI } from '../lib/constants'
import { UseSessionKeyResult } from '../hooks/useSessionKey'
import { UsePlayerBalanceResult } from '../hooks/usePlayerBalance'

/** 保留給 gas 的最低 session SUI（每筆 tx ~0.003 SUI，保留 0.05 SUI ≈ 15 筆） */
const GAS_RESERVE = 50_000_000n // 0.05 SUI

interface BalanceModalProps {
  session: UseSessionKeyResult
  playerBalance: UsePlayerBalanceResult
  onClose: () => void
}

export default function BalanceModal({ session, playerBalance, onClose }: BalanceModalProps) {
  const { fundSession } = session
  const { balance, needsCreate, isLoading, deposit, withdraw, createPlayerBalance } = playerBalance

  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [input, setInput] = useState('1')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const amountMist = (() => {
    const val = parseFloat(input)
    if (isNaN(val) || val <= 0) return 0n
    return BigInt(Math.floor(val * Number(MIST_PER_SUI)))
  })()

  const gameSUI = balance != null
    ? (Number(balance) / Number(MIST_PER_SUI)).toFixed(4)
    : '0.0000'

  // ── 充值：主錢包 → 遊戲餘額（一次授權）──
  const handleDeposit = async () => {
    if (amountMist <= GAS_RESERVE) {
      setMsg({ type: 'err', text: `最少充值 0.1 SUI` })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      // 轉入 session 地址（唯一錢包彈窗）
      await fundSession(amountMist)

      // 建立 PlayerBalance（若尚未建立）
      let pbId = playerBalance.playerBalanceId
      if (needsCreate || !pbId) {
        pbId = await createPlayerBalance()
      }

      // 扣除 gas 保留，其餘全存入遊戲餘額（靜默）
      const depositAmount = amountMist - GAS_RESERVE
      await deposit(depositAmount, pbId)

      setMsg({ type: 'ok', text: '充值成功！之後 Play、翻格、Cashout 全無需授權。' })
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message ?? '充值失敗' })
    } finally {
      setBusy(false)
    }
  }

  // ── 提款：遊戲餘額退回（無需授權）──
  const handleWithdraw = async () => {
    if (amountMist <= 0n) return
    if (balance !== null && amountMist > balance) {
      setMsg({ type: 'err', text: '提款金額超過遊戲餘額' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await withdraw(amountMist)
      setMsg({ type: 'ok', text: '提款成功！' })
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message ?? '提款失敗' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="panel p-6 w-full max-w-sm flex flex-col gap-4"
        style={{ background: '#0e0e24', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">遊戲帳戶</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* 餘額 */}
        <div className="rounded-lg p-4 flex flex-col items-center gap-1"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-gray-400 text-xs">遊戲餘額</span>
          <span className="text-white font-bold text-2xl">
            {isLoading ? '...' : `${gameSUI} SUI`}
          </span>
        </div>

        {/* Tab */}
        <div className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['deposit', 'withdraw'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setMsg(null) }}
              className="flex-1 py-2 text-sm font-medium transition-colors"
              style={{
                background: tab === t ? 'rgba(139,92,246,0.3)' : 'transparent',
                color: tab === t ? '#c4b5fd' : '#9ca3af',
              }}
            >
              {t === 'deposit' ? '充值' : '提款'}
            </button>
          ))}
        </div>

        {/* 金額輸入 */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-400 flex-shrink-0 flex items-center justify-center">
            <span className="text-white text-xs font-bold">S</span>
          </div>
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            min="0.1"
            step="0.1"
            className="bet-input flex-1"
            placeholder="金額（SUI）"
          />
          <span className="text-gray-400 text-sm flex-shrink-0">SUI</span>
        </div>

        {/* 動作按鈕 */}
        {tab === 'deposit' ? (
          <>
            <button
              onClick={handleDeposit}
              disabled={busy || amountMist <= GAS_RESERVE}
              className="btn-primary w-full"
            >
              {busy ? <Spinner /> : '充值（一次授權）'}
            </button>
            <p className="text-xs text-gray-500 text-center">
              充值後 Play / 翻格 / Cashout 全程無需再次授權
            </p>
          </>
        ) : (
          <>
            {balance !== null && amountMist > balance && amountMist > 0n && (
              <p className="text-sm text-red-400 text-center -mb-1">
                提款金額超過遊戲餘額（{(Number(balance) / Number(MIST_PER_SUI)).toFixed(4)} SUI）
              </p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={busy || amountMist <= 0n || (balance !== null && amountMist > balance)}
              className="btn-primary w-full"
            >
              {busy ? <Spinner /> : '提款（無需授權）'}
            </button>
          </>
        )}

        {msg && (
          <p className="text-sm text-center"
            style={{ color: msg.type === 'ok' ? '#34d399' : '#f87171' }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin mx-auto" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

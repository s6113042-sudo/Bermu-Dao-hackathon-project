/**
 * BalanceModal — TSUI / USDC 遊戲帳戶充值提款
 *
 * TSUI 充值：從測試水龍頭鑄造 TSUI 並存入 PlayerBalance（無需授權，gas 由 gas 錢包代付）
 * USDC 充值：從測試水龍頭鑄造 USDC 並存入 PlayerBalanceUSDC（無需授權）
 * 提款：session 靜默執行（無需授權）
 */

import { useState } from 'react'
import { MIST_PER_SUI, RAW_PER_USDC } from '../lib/constants'
import { UseSessionKeyResult } from '../hooks/useSessionKey'
import { UsePlayerBalanceResult } from '../hooks/usePlayerBalance'
import UsdcIcon from './UsdcIcon'

type BalanceCurrency = 'SUI' | 'USDC'

interface BalanceModalProps {
  session: UseSessionKeyResult
  playerBalance: UsePlayerBalanceResult
  onClose: () => void
}

export default function BalanceModal({ session: _session, playerBalance, onClose }: BalanceModalProps) {
  const {
    balance, needsCreate, isLoading, deposit, withdraw, createPlayerBalance,
    usdcBalance, needsCreateUSDC, usdcLoading, depositUSDC, withdrawUSDC, createPlayerBalanceUSDC,
  } = playerBalance

  const [currency, setCurrency] = useState<BalanceCurrency>('SUI')
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [input, setInput] = useState('10')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const unit = currency === 'SUI' ? MIST_PER_SUI : RAW_PER_USDC
  const symbol = currency === 'SUI' ? 'SUI' : 'USDC'
  const amountRaw = (() => {
    const val = parseFloat(input)
    if (isNaN(val) || val <= 0) return 0n
    return BigInt(Math.floor(val * Number(unit)))
  })()

  const displaySUI = balance != null
    ? (Number(balance) / Number(MIST_PER_SUI)).toFixed(4)
    : '0.0000'
  const displayUSDC = usdcBalance != null
    ? (Number(usdcBalance) / Number(RAW_PER_USDC)).toFixed(2)
    : '0.00'

  const handleDeposit = async () => {
    if (amountRaw <= 0n) return
    setBusy(true)
    setMsg(null)
    try {
      if (currency === 'SUI') {
        // 建立帳戶（若尚未建立），再鑄造 TSUI 存入
        let pbId = playerBalance.playerBalanceId
        if (needsCreate || !pbId) pbId = await createPlayerBalance()
        await deposit(amountRaw, pbId)
        setMsg({ type: 'ok', text: `充值 ${input} TSUI 成功！` })
      } else {
        let pbId = playerBalance.playerBalanceUSDCId
        if (needsCreateUSDC || !pbId) pbId = await createPlayerBalanceUSDC()
        await depositUSDC(amountRaw, pbId)
        setMsg({ type: 'ok', text: `充值 ${input} USDC 成功！` })
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message ?? '充值失敗' })
    } finally {
      setBusy(false)
    }
  }

  const handleWithdraw = async () => {
    const currentBalance = currency === 'SUI' ? balance : usdcBalance
    if (amountRaw <= 0n) return
    if (currentBalance !== null && amountRaw > currentBalance) {
      setMsg({ type: 'err', text: '提款金額超過遊戲餘額' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      if (currency === 'SUI') {
        await withdraw(amountRaw)
      } else {
        await withdrawUSDC(amountRaw)
      }
      setMsg({ type: 'ok', text: '提款成功！' })
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message ?? '提款失敗' })
    } finally {
      setBusy(false)
    }
  }

  const currentBalance = currency === 'SUI' ? balance : usdcBalance
  const loading = currency === 'SUI' ? isLoading : usdcLoading

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

        {/* 幣種選擇 */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['SUI', 'USDC'] as BalanceCurrency[]).map((c) => (
            <button
              key={c}
              onClick={() => { setCurrency(c); setMsg(null); setInput(c === 'SUI' ? '1' : '10') }}
              className="flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              style={{
                background: currency === c ? 'rgba(139,92,246,0.3)' : 'transparent',
                color: currency === c ? '#c4b5fd' : '#9ca3af',
              }}
            >
              {c === 'SUI' ? <SuiIcon size={14} /> : <UsdcIcon size={14} />}
              {c}
            </button>
          ))}
        </div>

        {/* 餘額顯示 */}
        <div className="rounded-lg p-4 flex gap-4 justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-gray-400 text-xs">SUI 遊戲餘額</span>
            <span className="text-white font-bold text-lg">{isLoading ? '...' : `${displaySUI}`}</span>
          </div>
          <div className="w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-gray-400 text-xs">USDC 遊戲餘額</span>
            <span className="text-emerald-300 font-bold text-lg">{usdcLoading ? '...' : `${displayUSDC}`}</span>
          </div>
        </div>

        {/* Tab */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
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
          {currency === 'SUI' ? <SuiIcon size={22} /> : <UsdcIcon size={22} />}
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            min={currency === 'SUI' ? '0.001' : '0.01'}
            step={currency === 'SUI' ? '0.1' : '1'}
            className="bet-input flex-1"
            placeholder={`金額（${symbol}）`}
          />
          <span className="text-gray-400 text-sm flex-shrink-0">{symbol}</span>
          {/* MAX 按鈕（提款時才顯示） */}
          {tab === 'withdraw' && currentBalance !== null && currentBalance > 0n && (
            <button
              onClick={() => {
                const maxVal = Number(currentBalance) / Number(unit)
                setInput(maxVal.toFixed(currency === 'SUI' ? 4 : 2))
              }}
              className="text-xs px-2 py-1 rounded flex-shrink-0 font-medium transition-colors hover:opacity-80"
              style={{ background: 'rgba(139,92,246,0.3)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.4)' }}
            >
              MAX
            </button>
          )}
        </div>

        {/* 提款超額警告 */}
        {tab === 'withdraw' && amountRaw > 0n && currentBalance !== null && amountRaw > currentBalance && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <span style={{ color: '#f87171' }}>⚠</span>
            <span style={{ color: '#f87171' }}>
              超過遊戲餘額，最多可提 {loading ? '...' : currency === 'SUI' ? `${displaySUI} SUI` : `${displayUSDC} USDC`}
            </span>
          </div>
        )}

        {/* 動作按鈕 */}
        {tab === 'deposit' ? (
          <>
            <button
              onClick={handleDeposit}
              disabled={busy || amountRaw <= 0n}
              className="btn-primary w-full"
            >
              {busy ? <Spinner /> : '充值（無需授權）'}
            </button>
            <p className="text-xs text-gray-500 text-center">
              {currency === 'SUI'
                ? '從測試水龍頭鑄造 TSUI，Gas 由平台代付'
                : '從測試水龍頭鑄造 USDC，Gas 由平台代付'}
            </p>
          </>
        ) : (
          <button
            onClick={handleWithdraw}
            disabled={busy || amountRaw <= 0n || (currentBalance !== null && amountRaw > currentBalance)}
            className="btn-primary w-full"
          >
            {busy ? <Spinner /> : '提款（無需授權）'}
          </button>
        )}

        {msg && (
          <p className="text-sm text-center" style={{ color: msg.type === 'ok' ? '#34d399' : '#f87171' }}>
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

function SuiIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <circle cx="41" cy="41" r="41" fill="#6fbcf0" />
      <path d="M54.5 28.5C52.8 26 50.5 24.2 47.8 23.3c-2.7-.9-5.7-.9-8.4 0-2.7.9-5 2.7-6.7 5.2L24.5 41c-3.3 4.9-3.3 11.3 0 16.2l4.2 6.2c2 3 5.3 4.7 8.8 4.7h6.6c3.5 0 6.8-1.7 8.8-4.7l4.2-6.2c3.3-4.9 3.3-11.3 0-16.2L54.5 28.5z" fill="white" />
      <path d="M36.5 53.5c1.2 1.8 3.2 2.9 5.4 2.9h3c2.2 0 4.2-1.1 5.4-2.9l3-4.5c2.4-3.5 2.4-8.1 0-11.6l-2.4-3.6c-.5.4-1.1.6-1.8.6-1.7 0-3-1.4-3-3.1 0-.6.2-1.1.4-1.6l-2.1-3.1c-.8-1.2-2.2-2-3.8-2s-3 .8-3.8 2l-2.1 3.1c.2.5.4 1 .4 1.6 0 1.7-1.3 3.1-3 3.1-.7 0-1.3-.2-1.8-.6L28.4 37c-2.4 3.5-2.4 8.1 0 11.6l1.5 2.2 6.6 2.7z" fill="#6fbcf0" />
    </svg>
  )
}


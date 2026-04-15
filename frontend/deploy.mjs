/**
 * deploy.mjs — 全新 publish 合約到 testnet（繞過 CLI 環境檢查）
 * 執行：node deploy.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 設定 ──────────────────────────────────────────────────────────
const DEVNET_RPC = 'https://fullnode.testnet.sui.io:443'

// Move 2024 content-hash address → 替換為 0x0
const COMPUTED_ADDR = 'cebbb240972009790cfae75cae5f3d8ddf44437c1065c2409a941c69e75b98b1'

// ── Keypair ────────────────────────────────────────────────────────
const keystorePath = join(process.env.HOME || process.env.USERPROFILE, '.sui', 'sui_config', 'sui.keystore')
const keystore = JSON.parse(readFileSync(keystorePath, 'utf-8'))
const rawKey = fromBase64(keystore[0])
const keypair = Ed25519Keypair.fromSecretKey(rawKey.slice(1))
console.log('部署地址:', keypair.getPublicKey().toSuiAddress())

// ── Address 替換 ───────────────────────────────────────────────────
function replaceAddr(bytecodeArr) {
  const buf = Buffer.from(bytecodeArr)
  const searchBuf = Buffer.from(COMPUTED_ADDR, 'hex')
  const zeroBuf = Buffer.alloc(32, 0)
  let count = 0
  let idx = buf.indexOf(searchBuf)
  while (idx !== -1) {
    zeroBuf.copy(buf, idx)
    count++
    idx = buf.indexOf(searchBuf, idx + 32)
  }
  if (count > 0) console.log(`  替換 computed addr → 0x0（${count} 處）`)
  return Array.from(buf)
}

// ── 讀取 bytecode ─────────────────────────────────────────────────
const buildDir = join(__dirname, '..', 'build', 'gamefi', 'bytecode_modules')

console.log('讀取 bytecode...')
const modules = ['mines', 'lottery', 'usdc', 'tsui'].map(name => {
  console.log(` - ${name}.mv`)
  return replaceAddr(Array.from(readFileSync(join(buildDir, `${name}.mv`))))
})

// ── Publish 交易 ──────────────────────────────────────────────────
const client = new SuiClient({ url: DEVNET_RPC })

async function main() {
  const tx = new Transaction()

  const [upgradeCap] = tx.publish({
    modules,
    dependencies: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ],
  })

  // 把 UpgradeCap 轉給部署者
  tx.transferObjects([upgradeCap], keypair.getPublicKey().toSuiAddress())

  console.log('正在送出 publish 交易...')
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  })

  console.log('\n交易 Digest:', result.digest)
  console.log('狀態:', result.effects?.status)

  console.log('\n─── 重要物件 ───')
  result.objectChanges?.forEach(c => {
    if (c.type === 'published') {
      console.log('新 Package ID:', c.packageId)
    }
    if (c.type === 'created') {
      console.log('Created:', c.objectType?.split('::').slice(-1)[0], '→', c.objectId)
    }
  })
}

main().catch(err => {
  console.error('錯誤:', err.message || err)
  process.exit(1)
})

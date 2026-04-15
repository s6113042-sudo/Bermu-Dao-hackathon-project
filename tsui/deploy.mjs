/**
 * deploy.mjs — 部署 TSUI 測試幣到 devnet
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEVNET_RPC = 'https://fullnode.devnet.sui.io:443'

const keystorePath = join(process.env.HOME || process.env.USERPROFILE, '.sui', 'sui_config', 'sui.keystore')
const keystore = JSON.parse(readFileSync(keystorePath, 'utf-8'))
const rawKey = fromBase64(keystore[0])
const keypair = Ed25519Keypair.fromSecretKey(rawKey.slice(1))
console.log('部署地址:', keypair.getPublicKey().toSuiAddress())

// 找出並替換 content-hash address（任何非零的 32-byte 地址）
function patchBytecode(bytecodeArr) {
  const buf = Buffer.from(bytecodeArr)
  const zeroBuf = Buffer.alloc(32, 0)
  let patched = 0

  // 掃描所有 32-byte 非零序列（content-hash 地址）
  for (let i = 0; i <= buf.length - 32; i++) {
    const slice = buf.slice(i, i + 32)
    if (!slice.equals(zeroBuf)) {
      // 檢查是否像地址（前面通常有特定 pattern）
      // 簡單策略：替換所有非零 32-byte 塊
      const hex = slice.toString('hex')
      if (hex !== '0'.repeat(64)) {
        // 只替換看起來像 address 的（全部非零）
        let allNonZero = true
        for (let j = 0; j < 32; j++) {
          if (buf[i + j] === 0 && j < 16) { allNonZero = false; break }
        }
      }
    }
  }

  return buf
}

// 替換特定 computed addr → 0x0
function replaceAddr(bytecodeArr, computedAddr) {
  const buf = Buffer.from(bytecodeArr)
  const searchBuf = Buffer.from(computedAddr, 'hex')
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

const buildDir = join(__dirname, 'build', 'tsui', 'bytecode_modules')
const client = new SuiClient({ url: DEVNET_RPC })

async function main() {
  // 先試著不替換，看錯誤訊息找出 computed addr
  console.log('讀取 bytecode...')
  let tsuiBytecode = Array.from(readFileSync(join(buildDir, 'tsui.mv')))

  // 第一次嘗試：不替換（取得 computed addr）
  const tx1 = new Transaction()
  const [cap1] = tx1.publish({
    modules: [tsuiBytecode],
    dependencies: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ],
  })
  tx1.transferObjects([cap1], keypair.getPublicKey().toSuiAddress())

  try {
    await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx1,
      options: { showEffects: true },
    })
    console.log('直接部署成功（無需替換）')
  } catch (e) {
    const msg = e.message || String(e)
    // 從錯誤中提取 computed addr
    const match = msg.match(/Non-zero address.*?([0-9a-f]{64})/i) ||
                  msg.match(/([0-9a-f]{64})/i)
    if (match) {
      const computedAddr = match[1]
      console.log('找到 computed addr:', computedAddr)

      // 替換後重新部署
      tsuiBytecode = replaceAddr(tsuiBytecode, computedAddr)
      const tx2 = new Transaction()
      const [cap2] = tx2.publish({
        modules: [tsuiBytecode],
        dependencies: [
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        ],
      })
      tx2.transferObjects([cap2], keypair.getPublicKey().toSuiAddress())

      console.log('正在送出 publish 交易（已替換地址）...')
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx2,
        options: { showEffects: true, showObjectChanges: true },
      })
      console.log('\n交易 Digest:', result.digest)
      console.log('狀態:', result.effects?.status)
      console.log('\n─── 重要物件 ───')
      result.objectChanges?.forEach(c => {
        if (c.type === 'published') console.log('Package ID:', c.packageId)
        if (c.type === 'created') console.log(c.objectType?.split('::').slice(-1)[0], '→', c.objectId)
      })
    } else {
      console.error('無法提取 computed addr:', msg)
    }
  }
}

main().catch(err => {
  console.error('錯誤:', err.message || err)
  process.exit(1)
})

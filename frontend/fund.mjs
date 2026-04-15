/**
 * fund.mjs — 向新合約注入流動性
 * 執行：node frontend/fund.mjs
 *
 * 功能：
 *   1. 鑄造 100,000 TSUI 並注入 GamePlatform 金庫
 *   2. 鑄造 100,000 USDC 並注入 GamePlatform 金庫
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 常數 ──────────────────────────────────────────────────────────
const RPC = 'https://fullnode.testnet.sui.io:443'

const PACKAGE_ID      = '0xe3a2548fe26476e33ebff61983e821b6f5752843633ad0dcac2658811a0b4c20'
const GAME_PLATFORM_ID = '0x7b7682ffe3e2516e6ea40dab7fcd77d92e6af96d3361e04fc5e689f04eff9ad1'
const TSUI_TREASURY_CAP_ID = '0x3d9f69929b14f5c42ff9968e1e5a5df2c15340172599e9f9b38b9e235464dff7'
const USDC_TREASURY_CAP_ID = '0x35a675138e0eae1c0b805224c69fb33eb41a6f6ef17cc3867b49604a484ea034'

// 100,000 TSUI（9 位小數）
const TSUI_AMOUNT = 100_000n * 1_000_000_000n
// 100,000 USDC（6 位小數）
const USDC_AMOUNT = 100_000n * 1_000_000n

// ── Keypair ────────────────────────────────────────────────────────
const keystorePath = join(process.env.HOME || process.env.USERPROFILE, '.sui', 'sui_config', 'sui.keystore')
const keystore = JSON.parse(readFileSync(keystorePath, 'utf-8'))
const rawKey = fromBase64(keystore[0])
const keypair = Ed25519Keypair.fromSecretKey(rawKey.slice(1))
const deployerAddr = keypair.getPublicKey().toSuiAddress()
console.log('操作地址:', deployerAddr)

const client = new SuiClient({ url: RPC })

async function findAdminCap() {
  console.log('尋找 AdminCap...')
  let cursor = null
  while (true) {
    const res = await client.getOwnedObjects({
      owner: deployerAddr,
      filter: { StructType: `${PACKAGE_ID}::mines::AdminCap` },
      options: { showType: true },
      cursor,
    })
    if (res.data.length > 0) {
      const id = res.data[0].data?.objectId
      console.log('找到 AdminCap:', id)
      return id
    }
    if (!res.hasNextPage) break
    cursor = res.nextCursor
  }
  throw new Error('找不到 AdminCap，請確認部署地址正確')
}

async function main() {
  const adminCapId = await findAdminCap()

  const tx = new Transaction()

  // 1. 鑄造 TSUI
  const [tsuiCoin] = tx.moveCall({
    target: '0x2::coin::mint',
    typeArguments: [`${PACKAGE_ID}::tsui::TSUI`],
    arguments: [
      tx.object(TSUI_TREASURY_CAP_ID),
      tx.pure.u64(TSUI_AMOUNT),
    ],
  })

  // 2. 注入 TSUI 到平台金庫
  tx.moveCall({
    target: `${PACKAGE_ID}::mines::add_liquidity`,
    arguments: [
      tx.object(adminCapId),
      tx.object(GAME_PLATFORM_ID),
      tsuiCoin,
    ],
  })

  // 3. 鑄造 USDC
  const [usdcCoin] = tx.moveCall({
    target: '0x2::coin::mint',
    typeArguments: [`${PACKAGE_ID}::usdc::USDC`],
    arguments: [
      tx.object(USDC_TREASURY_CAP_ID),
      tx.pure.u64(USDC_AMOUNT),
    ],
  })

  // 4. 注入 USDC 到平台金庫
  tx.moveCall({
    target: `${PACKAGE_ID}::mines::add_liquidity_usdc`,
    arguments: [
      tx.object(adminCapId),
      tx.object(GAME_PLATFORM_ID),
      usdcCoin,
    ],
  })

  console.log('送出注資交易...')
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  })

  console.log('\n交易 Digest:', result.digest)
  console.log('狀態:', result.effects?.status)
  if (result.effects?.status?.status === 'success') {
    console.log(`\n✅ 注資成功！`)
    console.log(`   TSUI: +${Number(TSUI_AMOUNT) / 1e9} TSUI`)
    console.log(`   USDC: +${Number(USDC_AMOUNT) / 1e6} USDC`)
  } else {
    console.error('❌ 交易失敗:', result.effects?.status?.error)
  }
}

main().catch(err => {
  console.error('錯誤:', err.message || err)
  process.exit(1)
})

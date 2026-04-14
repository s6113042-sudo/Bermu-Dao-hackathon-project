/**
 * deploy.mjs — 直接用 bytecode 升級合約到 devnet，繞過 CLI 環境檢查
 * 執行：node deploy.mjs
 */
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 設定 ──────────────────────────────────────────────────────────
const DEVNET_RPC = 'https://fullnode.devnet.sui.io:443'
const UPGRADE_CAP_ID = '0x58b74795317ec4c0ef4d3a78fb697aade358904de2ec39d6f20628d95bdfc7a1'
const PACKAGE_ID = '0x658ae769856c4a418f2202ac00a1561a0e62f411c92bb259f1d6c7c9623442c2'

// 從 keystore 讀取第一把 key（即部署者地址）
const keystorePath = join(process.env.HOME || process.env.USERPROFILE, '.sui', 'sui_config', 'sui.keystore')
const keystore = JSON.parse(readFileSync(keystorePath, 'utf-8'))

// keystore 裡的 key 是 base64 encoded，首 byte 是 scheme flag
const rawKey = fromBase64(keystore[0])
const keypair = Ed25519Keypair.fromSecretKey(rawKey.slice(1))
console.log('部署地址:', keypair.getPublicKey().toSuiAddress())

// ── 讀取 bytecode ─────────────────────────────────────────────────
const buildDir = join(__dirname, 'build', 'gamefi', 'bytecode_modules')

function readBytecode(filePath) {
  return Array.from(readFileSync(filePath))
}

const modules = ['mines', 'lottery', 'usdc'].map(name =>
  readBytecode(join(buildDir, `${name}.mv`))
)

// 讀取依賴 bytecode（Sui framework 和 MoveStdlib）
const depsDir = join(buildDir, 'dependencies')
const depModules = []
for (const depPkg of ['Sui', 'MoveStdlib']) {
  const pkgDir = join(depsDir, depPkg)
  try {
    for (const file of readdirSync(pkgDir)) {
      if (file.endsWith('.mv')) {
        depModules.push(readBytecode(join(pkgDir, file)))
      }
    }
  } catch {}
}

// ── 建立 upgrade 交易 ─────────────────────────────────────────────
const client = new SuiClient({ url: DEVNET_RPC })

async function main() {
  const tx = new Transaction()

  // 取得 UpgradeCap 物件
  const upgradeCapObj = tx.object(UPGRADE_CAP_ID)

  // 授權升級（policy = 0 = compatible）
  const [upgradeTicket] = tx.moveCall({
    target: '0x2::package::authorize_upgrade',
    arguments: [
      upgradeCapObj,
      tx.pure.u8(0), // UpgradePolicy::COMPATIBLE
      tx.pure.vector('u8', Array.from(Buffer.alloc(32))), // digest placeholder
    ],
  })

  // 執行升級
  const [receipt] = tx.upgrade({
    modules,
    dependencies: [
      '0x0000000000000000000000000000000000000000000000000000000000000001', // MoveStdlib
      '0x0000000000000000000000000000000000000000000000000000000000000002', // Sui
    ],
    package: PACKAGE_ID,
    ticket: upgradeTicket,
  })

  // 確認升級
  tx.moveCall({
    target: '0x2::package::commit_upgrade',
    arguments: [upgradeCapObj, receipt],
  })

  console.log('正在送出 upgrade 交易...')
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  })

  console.log('交易 Digest:', result.digest)
  console.log('狀態:', result.effects?.status)

  // 找出新的 Package ID
  const newPkg = result.objectChanges?.find(
    c => c.type === 'published' || (c.type === 'mutated' && c.objectType?.includes('package'))
  )
  if (newPkg) {
    console.log('新 Package 物件:', JSON.stringify(newPkg, null, 2))
  }

  console.log('\n完整 objectChanges:')
  result.objectChanges?.forEach(c => console.log(JSON.stringify(c)))
}

main().catch(err => {
  console.error('錯誤:', err.message || err)
  process.exit(1)
})

/**
 * gasWallet.ts — Gas Sponsorship 工具
 *
 * Gas 錢包持有少量原生 SUI（testnet），代替玩家支付所有交易的 gas fee。
 * 私鑰僅存於 .env.local，僅用於測試網。
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'

// 從環境變數載入 gas 錢包私鑰
const GAS_KEY = (import.meta as any).env?.VITE_GAS_WALLET_KEY as string

let _gasKeypair: Ed25519Keypair | null = null

export function getGasKeypair(): Ed25519Keypair {
  if (!_gasKeypair) {
    if (!GAS_KEY) throw new Error('VITE_GAS_WALLET_KEY 未設定')
    _gasKeypair = Ed25519Keypair.fromSecretKey(GAS_KEY)
  }
  return _gasKeypair
}

export function getGasAddress(): string {
  return getGasKeypair().getPublicKey().toSuiAddress()
}

/**
 * 執行贊助交易
 *
 * 使用方式：
 *   1. 由 sender（玩家 session key 或錢包）簽署 tx data
 *   2. gas 錢包簽署 gas data
 *   3. 提交雙簽名
 *
 * @param tx         已建構好的 Transaction
 * @param senderAddress  發送者地址（玩家）
 * @param signForSender  簽署函式（session key 或 dapp-kit wallet）
 * @param client     SuiClient
 */
export async function executeSponsoredTransaction(
  tx: Transaction,
  senderAddress: string,
  signForSender: (bytes: Uint8Array) => Promise<string>,
  client: SuiClient,
) {
  const gasKeypair = getGasKeypair()
  const gasAddress = gasKeypair.getPublicKey().toSuiAddress()

  // 設定發送者與 gas 贊助者
  tx.setSender(senderAddress)
  tx.setGasOwner(gasAddress)
  tx.setGasBudget(10_000_000) // 0.01 SUI

  const txBytes = await tx.build({ client })

  // 雙方分別簽署相同的 tx bytes
  const senderSig = await signForSender(txBytes)
  const { signature: sponsorSig } = await gasKeypair.signTransaction(txBytes)

  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [senderSig, sponsorSig],
    options: { showEffects: true, showObjectChanges: true },
  })

  return result
}

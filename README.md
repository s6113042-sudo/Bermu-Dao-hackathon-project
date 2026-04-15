# Bermuda DAO — Mines GameFi on Sui

**線上網站：[https://bermu-dao-hackathon-project.vercel.app/](https://bermu-dao-hackathon-project.vercel.app/)**

基於 Sui 區塊鏈的可驗公平性鏈上**踩地雷**遊戲。玩家連接 Sui 錢包，將 TSUI 或 USDC 存入局內餘額，在 4×4 的格子盤（含 5 顆地雷）上翻牌。隨時收手鎖定倍率，或繼續翻牌追求更高獎勵——踩到炸彈則本局結束、押注歸零。

---

## 功能特色

- **全鏈上邏輯** — 遊戲狀態、隨機性與派彩均由 Move 智能合約處理
- **雙幣種支援** — 可使用 TSUI 或 USDC 下注
- **Session Key 架構** — 交易由臨時 Session Key 簽署，點擊即玩，無須每步彈出錢包確認
- **Gas 贊助** — 由平台 Gas 錢包代付 Gas 費，玩家無需持有原生 SUI
- **可驗公平性** — 每次翻牌的交易 Digest 均記錄在鏈上，可自行驗證
- **每輪抽獎系統** — 每局結束自動獲得彩票，每 20 分鐘開獎一次；中獎者可隨時領取，不受後續開獎影響

---

## 遊戲規則

| 參數 | 數值 |
|---|---|
| 格子盤 | 4×4（16 格） |
| 地雷數量 | 5 |
| 最低押注（TSUI） | 0.05 TSUI |
| 最高押注（TSUI） | 10 TSUI |
| 最低押注（USDC） | 0.05 USDC |
| 最高押注（USDC） | 10 USDC |
| 莊家優勢 | 5% |
| 抽獎注入比例 | 莊家利潤的 5% |
| 開獎間隔 | 每 20 分鐘 |

翻開安全格可提升倍率。在踩到炸彈前收手即可領取獎金。倍率由合約根據剩餘安全格數量即時計算。

---

## 抽獎系統

- 每完成一局遊戲（收手或爆炸）自動獲得一張彩票
- 每 20 分鐘任何人皆可觸發開獎
- 每輪獎金物理存入獨立的 prizes table，中獎後可隨時領取，不被下一輪覆蓋
- 若持有多輪中獎票，可一筆交易一次領完所有獎金

---

## 技術棧

| 層級 | 技術 |
|---|---|
| 智能合約 | [Sui Move](https://docs.sui.io/guides/developer/first-app/write-package) |
| 前端 | React 18 + Vite + TypeScript |
| 錢包整合 | [@mysten/dapp-kit](https://sdk.mystenlabs.com/dapp-kit) |
| 樣式 | Tailwind CSS |
| 網路 | Sui Testnet |

---

## 合約地址（Testnet）

> 本專案所有合約均部署於 **Sui 測試網（Testnet）**。

### 核心物件

| 物件 | ID |
|---|---|
| Package | `0xe3a2548fe26476e33ebff61983e821b6f5752843633ad0dcac2658811a0b4c20` |
| GamePlatform | `0x7b7682ffe3e2516e6ea40dab7fcd77d92e6af96d3361e04fc5e689f04eff9ad1` |
| LotterySystem | `0x1df915d191665bf41d4256d4198b8f7952fa1a8df7929a4500655a0e9429e6d4` |

### 代幣

| 代幣 | Coin Type | TreasuryCap |
|---|---|---|
| TSUI（測試用 SUI） | `0xe3a2...::tsui::TSUI` | `0x3d9f69929b14f5c42ff9968e1e5a5df2c15340172599e9f9b38b9e235464dff7` |
| USDC（測試用穩定幣） | `0xe3a2...::usdc::USDC` | `0x35a675138e0eae1c0b805224c69fb33eb41a6f6ef17cc3867b49604a484ea034` |

---

## 專案結構

```
.
├── sources/              # Move 智能合約原始碼
│   ├── mines.move        # 遊戲主邏輯（下注、翻牌、收手、PlayerBalance）
│   ├── lottery.move      # 抽獎系統（每輪獎金物理分離）
│   ├── tsui.move         # 測試用 SUI 代幣（9 位小數）
│   └── usdc.move         # 測試用 USDC 代幣（6 位小數）
├── frontend/             # React 前端
│   ├── src/
│   │   ├── components/   # UI 元件（GameBoard、LotteryPanel 等）
│   │   ├── hooks/        # React Hooks（useGameSession、useLottery 等）
│   │   ├── lib/          # 合約常數（constants.ts）
│   │   └── types/        # TypeScript 型別定義
│   ├── deploy.mjs        # 合約部署腳本
│   └── fund.mjs          # 流動性注資腳本
├── Move.toml             # Move 套件設定檔
└── Move.lock             # Move 依賴鎖定檔
```

---

## 快速開始

### 前置需求

- [Node.js](https://nodejs.org/) v18+
- Sui 錢包（例如 [Sui Wallet 瀏覽器擴充套件](https://suiwallet.com/)）

### 本地啟動前端

```bash
cd frontend
npm install
npm run dev
```

應用程式將運行於 `http://localhost:5173`。

### 部署合約（Testnet）

```bash
# 先建置 Move 合約
sui move build --build-env testnet

# 部署至 Testnet
node frontend/deploy.mjs
```

部署後，請更新 [frontend/src/lib/constants.ts](frontend/src/lib/constants.ts) 中的合約 ID。

### 注入流動性

```bash
node frontend/fund.mjs
```

預設注入 100,000 TSUI 與 100,000 USDC 至 GamePlatform 金庫。

---

## 遊戲玩法

1. 連接 Sui 錢包
2. 從水龍頭領取 TSUI 或 USDC 測試幣
3. 將代幣存入局內餘額
4. 選擇幣種與押注金額，點擊**開始**
5. 點擊格子翻牌——安全格會提升倍率
6. 點擊**收手**領取獎金，或繼續翻牌追求更高賠率
7. 踩到炸彈則本局結束，押注損失
8. 每局結束自動獲得彩票，20 分鐘後可觸發開獎

---

## 公平性驗證

每次翻牌均會產生一筆鏈上交易 Digest。你可在 [Sui Explorer（Testnet）](https://suiscan.xyz/testnet) 查詢任意局的交易紀錄，或點擊遊戲介面中的公平性圖示（⚖）查看本局所有 Digest。

---

## 授權條款

MIT

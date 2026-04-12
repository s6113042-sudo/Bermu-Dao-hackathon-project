# Bermuda DAO — Mines GameFi on Sui

**線上網站：[https://bermu-dao-hackathon-project.vercel.app/](https://bermu-dao-hackathon-project.vercel.app/)**

基於 Sui 區塊鏈的可驗公平性鏈上**踩地雷**遊戲。玩家連接 Sui 錢包，將 SUI 或 USDC 存入局內餘額，在 4×4 的格子盤（含 5 顆地雷）上翻牌。隨時收手鎖定倍率，或繼續翻牌追求更高獎勵——踩到炸彈則本局結束、押注歸零。

---

## 功能特色

- **全鏈上邏輯** — 遊戲狀態、隨機性與派彩均由 Move 智能合約處理
- **雙幣種支援** — 可使用 SUI 或 USDC 下注
- **Session Key 架構** — 交易由臨時 Session Key 簽署，點擊即玩，無須每步彈出錢包確認
- **可驗公平性** — 每次翻牌的交易 Digest 均記錄在鏈上，可自行驗證
- **抽獎系統** — 每次翻牌自動獲得抽獎票，每 20 分鐘自動開獎

---

## 遊戲規則

| 參數 | 數值 |
|---|---|
| 格子盤 | 4×4（16 格） |
| 地雷數量 | 5 |
| 最低押注（SUI） | 0.01 SUI |
| 最高押注（SUI） | 10 SUI |
| 最低押注（USDC） | 1 USDC |
| 最高押注（USDC） | 10 USDC |
| 莊家優勢 | 5% |

翻開安全格可提升倍率。在踩到炸彈前收手即可領取獎金。倍率由合約根據剩餘安全格數量即時計算。

---

## 技術棧

| 層級 | 技術 |
|---|---|
| 智能合約 | [Sui Move](https://docs.sui.io/guides/developer/first-app/write-package) |
| 前端 | React 18 + Vite + TypeScript |
| 錢包整合 | [@mysten/dapp-kit](https://sdk.mystenlabs.com/dapp-kit) |
| 樣式 | Tailwind CSS |
| 網路 | Sui Devnet |

---

## 相關資源

本專案基於 **Bermu-DAO Sui 工作坊** 的技術框架開發，涵蓋 Sui Move 智能合約、代幣（Coin）與 NFT 開發的實作範例。

> 工作坊原始碼：[https://github.com/Bermu-DAO/sui_workshop](https://github.com/Bermu-DAO/sui_workshop)

工作坊內容包括：
- `CoinExample` — Sui 鏈上代幣創建與管理
- `NFTExample` — NFT 開發實作
- `workshop0 / workshop1` — Sui Move 開發入門課程

本遊戲合約（`mines.move`）即以 Workshop 的 Move 語言為基礎，串接 Sui 官方 Framework 完成鏈上遊戲邏輯。

---

## 合約地址（Devnet）

> 本專案所有合約均部署於 **Sui 開發網（Devnet）**。

### 遊戲合約

| 物件 | ID |
|---|---|
| Package | `0xcb6711d9fe1ba096f6ae53d5179b8dc4f2fa82249a5bb9bfa86e6f947a5cc1d0` |
| GamePlatform | `0x1503be4430c13cb9d9a90722a91ad1af22eb7667043f73351a533959fc02e94a` |
| LotterySystem | `0xbddac7c8a0ce7d6a464c22d964929ac7df22b53a2f2c3521219ace780879474c` |

### 代幣合約

| 代幣 | 說明 | 資訊 |
|---|---|---|
| SUI | Sui 鏈原生代幣 | 原生幣，無需獨立合約地址 |
| USDC | 測試用穩定幣（同 Package 內發行） | Coin Type：`0xcb6711d9fe1ba096f6ae53d5179b8dc4f2fa82249a5bb9bfa86e6f947a5cc1d0::usdc::USDC` |
| USDC TreasuryCap | USDC 鑄造權限物件（測試水龍頭用） | `0xc557c03171ae603ee9679fd4c18b7fe9343b4d14ca38e2a5a150000f98dcf8c1` |

---

## 專案結構

```
.
├── sources/          # Move 智能合約原始碼
│   └── mines.move
├── frontend/         # React 前端
│   └── src/
│       ├── components/   # UI 元件（GameBoard、BetControls 等）
│       ├── hooks/        # React Hooks（useGameSession、useSessionKey 等）
│       ├── lib/          # 常數與合約 ID
│       └── types/        # TypeScript 型別定義
├── Move.toml         # Move 套件設定檔
└── Move.lock         # Move 依賴鎖定檔
```

---

## 快速開始

### 前置需求

- [Node.js](https://nodejs.org/) v18+
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)（部署合約用）
- Sui 錢包（例如 [Sui Wallet 瀏覽器擴充套件](https://suiwallet.com/)）

### 本地啟動前端

```bash
cd frontend
npm install
npm run dev
```

應用程式將運行於 `http://localhost:5173`。

### 部署合約（Devnet）

```bash
sui client switch --env devnet
sui client publish --gas-budget 100000000
```

部署後，請更新 [frontend/src/lib/constants.ts](frontend/src/lib/constants.ts) 中的合約 ID。

---

## 遊戲玩法

1. 連接 Sui 錢包
2. 將 SUI 或 USDC 存入局內餘額
3. 輸入押注金額並點擊**開始**
4. 點擊格子翻牌——安全格會提升倍率
5. 點擊**收手**領取獎金，或繼續翻牌追求更高賠率
6. 踩到炸彈則本局結束，押注損失

---

## 公平性驗證

每次翻牌均會產生一筆鏈上交易 Digest。你可在 [Sui Explorer](https://suiscan.xyz/devnet) 查詢任意局的交易紀錄，或點擊遊戲介面中的公平性圖示（⚖）查看本局所有 Digest。

---

## 授權條款

MIT

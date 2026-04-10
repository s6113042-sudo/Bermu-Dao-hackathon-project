# Bermuda DAO — Mines GameFi on Sui

A provably fair on-chain **Minesweeper** game built on the Sui blockchain. Players connect their Sui wallet, deposit SUI or USDC into a session balance, and flip tiles on a 4×4 grid (5 hidden bombs). Cash out any time to lock in your multiplier, or hit a bomb and lose your bet.

---

## Features

- **Fully on-chain logic** — game state, randomness, and payouts are all handled by a Move smart contract
- **Dual-currency** — bet with SUI or USDC
- **Session key architecture** — transactions are signed by a temporary session key for a seamless, click-to-play experience (no wallet popup per move)
- **Provably fair** — every reveal transaction digest is recorded and can be independently verified
- **Lottery system** — each reveal earns a lottery ticket; prizes are drawn automatically every 20 minutes
- **5% house edge** — transparent and enforced on-chain

---

## Game Rules

| Parameter | Value |
|---|---|
| Grid | 4×4 (16 tiles) |
| Bombs | 5 |
| Min bet (SUI) | 0.001 SUI |
| Max bet (SUI) | 10 SUI |
| Min bet (USDC) | 0.01 USDC |
| Max bet (USDC) | 10 USDC |
| House edge | 5% |

Reveal safe tiles to increase your multiplier. Cash out before hitting a bomb to collect your winnings. The multiplier is calculated on-chain based on the number of safe tiles remaining.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | [Sui Move](https://docs.sui.io/guides/developer/first-app/write-package) |
| Frontend | React 18 + Vite + TypeScript |
| Wallet integration | [@mysten/dapp-kit](https://sdk.mystenlabs.com/dapp-kit) |
| Styling | Tailwind CSS |
| Network | Sui Devnet |

---

## Contract Addresses (Devnet)

| Object | ID |
|---|---|
| Package | `0x658ae769856c4a418f2202ac00a1561a0e62f411c92bb259f1d6c7c9623442c2` |
| GamePlatform | `0xb918916b38ebe12f8e330b5b354e15d1ec4a2d671b53b0cb850ffd410d499e08` |
| LotterySystem | `0x8ba41f163421bddcc6006dd71411bc14cab1da234963da686a0f24f5f4db88fa` |

---

## Project Structure

```
.
├── sources/          # Move smart contract source files
│   └── mines.move
├── frontend/         # React frontend
│   └── src/
│       ├── components/   # UI components (GameBoard, BetControls, etc.)
│       ├── hooks/        # React hooks (useGameSession, useSessionKey, etc.)
│       ├── lib/          # Constants and contract IDs
│       └── types/        # TypeScript types
├── Move.toml         # Move package manifest
└── Move.lock         # Move dependency lockfile
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (for contract deployment)
- A Sui wallet (e.g. [Sui Wallet browser extension](https://suiwallet.com/))

### Run the frontend locally

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Deploy the contract (devnet)

```bash
sui client switch --env devnet
sui client publish --gas-budget 100000000
```

After publishing, update the contract IDs in [frontend/src/lib/constants.ts](frontend/src/lib/constants.ts).

---

## How to Play

1. Connect your Sui wallet
2. Deposit SUI or USDC into your session balance
3. Enter a bet amount and click **Play**
4. Click tiles to reveal them — safe tiles increase your multiplier
5. Click **Cash Out** to collect winnings, or keep going for a higher payout
6. If you hit a bomb, the round ends and your bet is lost

---

## Fairness Verification

Every tile reveal produces an on-chain transaction digest. You can verify the outcome of any game session by looking up the transaction digests in the [Sui Explorer](https://suiscan.xyz/devnet) — click the fairness icon (⚖) in the game UI to view your session's digest history.

---

## License

MIT

# Incentives Wallet

A BSC (Binance Smart Chain) crypto wallet that comes bundled with the Soulmate AI project. Supports sending, receiving, and storing multiple cryptocurrencies including stablecoins for GitHub bounty payments.

## Supported Tokens

| Token | Type | Use Case |
|-------|------|----------|
| **BNB** | Native | Gas fees, payments |
| **INC** | ERC-20 | Incentives token |
| **USDC** | Stablecoin | GitHub bounties, payments |
| **USDT** | Stablecoin | Payments |
| **BUSD** | Stablecoin | Payments |
| **DAI** | Stablecoin | DAO bounties |

## Features

- **Create wallet** — Generate a new BSC wallet with 12-word mnemonic
- **Import wallet** — Load existing wallet via private key or mnemonic
- **Send/Receive** — All 6 supported tokens
- **Balance display** — Real-time balances with USD values
- **Transaction history** — Local history of all transactions
- **Auto-lock** — Lock wallet to clear session

## Quick Start

```bash
# From the soulmate project root
py -V:Astral/CPython3.11.15 wallet/serve.py
```

Then open http://localhost:8545 in your browser.

## For GitHub Bounty Payments

This wallet supports **USDC** — the most widely used stablecoin for open-source bounties on GitHub. Share your wallet address on your GitHub profile or bounty posts to receive payments.

## Security

- Your private key is stored only in your browser's localStorage
- Never share your mnemonic phrase or private key
- The wallet connects directly to BSC RPC nodes — no middleman
- All transactions are signed locally before broadcasting

## Live Instance

A public instance is hosted at: https://191.44.121.29.sslip.io

## Wallet API

The wallet includes a REST API server for programmatic access:

```bash
py -V:Astral/CPython3.11.15 wallet/api_server.py
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/health` | GET | Health check (no auth) |
| `/v1/balance` | GET | Get all token balances |
| `/v1/address` | GET | Get wallet address |
| `/v1/send` | POST | Send any token |
| `/v1/paypal/webhook` | POST | PayPal payment → crypto auto-conversion |

All API endpoints (except health) require `X-API-Token` header.

## PayPal Integration

The wallet supports automatic PayPal-to-crypto conversion:
1. Buyer pays via PayPal and includes their BSC address in the note
2. PayPal sends a webhook to the API server
3. Server automatically sends equivalent USDT to the buyer's wallet

## Disclaimer

This wallet is provided as-is for use with the Soulmate AI project. Always backup your mnemonic phrase and never share your private key.

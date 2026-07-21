# Soulmate Secure Vault

AES-256 encrypted storage for sensitive credentials — API keys, passwords, recovery codes, wallet private keys, and more.

The vault lives in `~/.fablemythos/vault/` — **outside** any git repo — so your secrets are never pushed to GitHub.

## Features

- **AES-256 encryption** (Fernet) — all secrets encrypted at rest
- **Categories/folders** — organize secrets by project (e.g., `incentives_corp`, `soulmate`, `general`)
- **Local only** — no cloud, no network, no telemetry
- **Cross-platform** — works on Windows, Linux, macOS

## Installation

```bash
pip install cryptography
```

## Usage

```bash
# Store a secret
py -V:Astral/CPython3.11.15 vault/vault.py --store my_api_key "sk-abc123" "Note about this key"

# Store with a category
py -V:Astral/CPython3.11.15 vault/vault.py --store wallet_private_key "0xABC..." --category incentives_corp

# Retrieve a secret
py -V:Astral/CPython3.11.15 vault/vault.py --get my_api_key

# List all secrets (names only, not values)
py -V:Astral/CPython3.11.15 vault/vault.py --list

# List secrets in a specific category
py -V:Astral/CPython3.11.15 vault/vault.py --list --category incentives_corp

# List all categories
py -V:Astral/CPython3.11.15 vault/vault.py --categories

# Delete a secret
py -V:Astral/CPython3.11.15 vault/vault.py --delete my_api_key
```

## How It Works

1. On first run, a Fernet encryption key is generated and saved to `~/.fablemythos/vault/.key`
2. Secrets are stored as encrypted JSON in `~/.fablemythos/vault/vault.enc`
3. Only the encrypted file and key exist on disk — plaintext is never written
4. File permissions are restricted to the current user

## Security Notes

- **Never commit `vault.enc` or `.key` to git** — they're stored outside the repo by design
- **Back up your `.key` file** — if you lose it, your secrets are unrecoverable
- **Keep your vault password safe** — there's no password recovery
- The vault is designed for local development use, not for production secret management

## Integration with Soulmate

The vault integrates with the Soulmate AI agent and wallet:
- Store wallet private keys and mnemonics securely
- Store API tokens for the wallet API server
- Store PayPal credentials for webhook verification
- Store VPS SSH credentials for deployment
- Organize secrets by project using categories

## File Locations

| File | Path | Description |
|------|------|-------------|
| Encryption key | `~/.fablemythos/vault/.key` | Fernet key (keep safe!) |
| Encrypted vault | `~/.fablemythos/vault/vault.enc` | All encrypted secrets |
| Vault script | `vault/vault.py` (in repo) | CLI tool |

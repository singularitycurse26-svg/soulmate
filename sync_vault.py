#!/usr/bin/env python
"""Sync Soulmate OS account info from browser localStorage to encrypted vault.

This script reads the soulmate_vault_accounts from a JSON file exported from
the browser and stores each account's credentials in the encrypted FableMythos
vault for permanent safekeeping.

Usage:
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --store soulmate_email "justin@example.com" --category soulmate_os
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --store soulmate_session_token "abc123..." --category soulmate_os
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --list --category soulmate_os

Or use this sync script:
    python sync_vault.py accounts.json
"""

import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime

VAULT_SCRIPT = Path.home() / ".fablemythos" / "vault.py"
CATEGORY = "soulmate_os"


def store_in_vault(key: str, value: str, category: str = CATEGORY):
    """Store a key-value pair in the encrypted vault."""
    cmd = [
        sys.executable,
        str(VAULT_SCRIPT),
        "--store",
        key,
        value,
        "--category",
        category,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        print(f"  ERROR storing {key}: {result.stderr}")
    else:
        print(f"  Stored: {key} = {value[:20]}...")


def sync_accounts(json_file: str):
    """Sync all accounts from JSON file to encrypted vault."""
    with open(json_file, "r") as f:
        accounts = json.load(f)

    print(f"Syncing {len(accounts)} account(s) to encrypted vault...")
    print(f"Vault: {VAULT_SCRIPT}")
    print(f"Category: {CATEGORY}")
    print()

    for i, account in enumerate(accounts):
        email = account.get("email", f"unknown_{i}")
        print(f"Account: {email}")

        store_in_vault(f"soulmate_email_{email}", email)
        store_in_vault(f"soulmate_session_{email}", account.get("session_token", ""))
        store_in_vault(f"soulmate_userid_{email}", str(account.get("user_id", "")))
        store_in_vault(f"soulmate_created_{email}", account.get("created_at", ""))

        if account.get("wallet_address"):
            store_in_vault(f"soulmate_wallet_addr_{email}", account["wallet_address"])
        if account.get("wallet_key"):
            store_in_vault(f"soulmate_wallet_key_{email}", account["wallet_key"])
        if account.get("last_login"):
            store_in_vault(f"soulmate_last_login_{email}", account["last_login"])

        print()

    print("Done! All account info stored in encrypted vault.")
    print(f"View with: py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --list --category {CATEGORY}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_vault.py <accounts.json>")
        print("  Export accounts.json from browser: copy localStorage.getItem('soulmate_vault_accounts')")
        sys.exit(1)
    sync_accounts(sys.argv[1])

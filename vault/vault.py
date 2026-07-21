#!/usr/bin/env python
"""Soulmate Secure Vault — encrypted storage for sensitive credentials.

Stores API keys, passwords, recovery codes, and other secrets locally.
Everything is AES-256 encrypted. The vault lives in ~/.fablemythos/vault/
which is outside any git repo and never pushed to GitHub.

Supports categories (folders) for organizing secrets by project.

Usage:
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --store pypi_recovery_code "ABC123XYZ"
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --store wallet_private_key "0xABC..." --category incentives_corp
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --get pypi_recovery_code
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --list
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --list --category incentives_corp
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --delete pypi_recovery_code
    py -V:Astral/CPython3.11.15 ~/.fablemythos/vault.py --categories
"""

import os
import sys
import json
import hashlib
import argparse
from pathlib import Path
from cryptography.fernet import Fernet
from datetime import datetime

VAULT_DIR = Path.home() / ".fablemythos" / "vault"
VAULT_FILE = VAULT_DIR / "vault.enc"
KEY_FILE = VAULT_DIR / ".key"


def _get_or_create_key() -> bytes:
    """Get or create the encryption key."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    
    if KEY_FILE.exists():
        return KEY_FILE.read_bytes()
    
    key = Fernet.generate_key()
    KEY_FILE.write_bytes(key)
    
    # Restrict file permissions on Windows
    try:
        import subprocess
        subprocess.run(["icacls", str(KEY_FILE), "/inheritance:r", "/grant:r", f"{os.getlogin()}:(R,W)"], 
                      capture_output=True, timeout=5)
    except Exception:
        pass
    
    return key


def _load_vault() -> dict:
    """Load and decrypt the vault."""
    if not VAULT_FILE.exists():
        return {}
    
    key = _get_or_create_key()
    f = Fernet(key)
    
    try:
        decrypted = f.decrypt(VAULT_FILE.read_bytes())
        return json.loads(decrypted)
    except Exception:
        return {}


def _save_vault(data: dict) -> None:
    """Encrypt and save the vault."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    
    key = _get_or_create_key()
    f = Fernet(key)
    
    encrypted = f.encrypt(json.dumps(data, indent=2).encode())
    VAULT_FILE.write_bytes(encrypted)
    
    # Restrict file permissions
    try:
        import subprocess
        subprocess.run(["icacls", str(VAULT_FILE), "/inheritance:r", "/grant:r", f"{os.getlogin()}:(R,W)"],
                      capture_output=True, timeout=5)
    except Exception:
        pass


def store(name: str, value: str, note: str = "", category: str = "") -> None:
    """Store a secret in the vault."""
    data = _load_vault()
    data[name] = {
        "value": value,
        "note": note,
        "category": category,
        "stored_at": datetime.now().isoformat(),
    }
    _save_vault(data)
    cat_str = f" [{category}]" if category else ""
    print(f"Stored: {name}{cat_str}")


def get(name: str) -> None:
    """Retrieve a secret from the vault."""
    data = _load_vault()
    if name not in data:
        print(f"Not found: {name}")
        return
    entry = data[name]
    print(f"Name: {name}")
    if entry.get('category'):
        print(f"Category: {entry['category']}")
    print(f"Value: {entry['value']}")
    if entry.get('note'):
        print(f"Note: {entry['note']}")
    print(f"Stored: {entry.get('stored_at', 'unknown')}")


def list_all(category: str = "") -> None:
    """List all stored secrets (names only, not values)."""
    data = _load_vault()
    if not data:
        print("Vault is empty")
        return
    
    if category:
        filtered = {k: v for k, v in data.items() if v.get('category', '') == category}
        if not filtered:
            print(f"No items in category: {category}")
            return
        print(f"Category [{category}] — {len(filtered)} items:")
        for name, entry in filtered.items():
            note = f" — {entry['note']}" if entry.get('note') else ""
            print(f"  - {name}{note}")
    else:
        categories = {}
        uncategorized = {}
        for name, entry in data.items():
            cat = entry.get('category', '')
            if cat:
                categories.setdefault(cat, {})[name] = entry
            else:
                uncategorized[name] = entry
        
        print(f"Vault contains {len(data)} items in {len(categories) + (1 if uncategorized else 0)} categories:")
        
        if uncategorized:
            print(f"\n  [general] — {len(uncategorized)} items:")
            for name, entry in uncategorized.items():
                note = f" — {entry['note']}" if entry.get('note') else ""
                print(f"    - {name}{note}")
        
        for cat, items in sorted(categories.items()):
            print(f"\n  [{cat}] — {len(items)} items:")
            for name, entry in items.items():
                note = f" — {entry['note']}" if entry.get('note') else ""
                print(f"    - {name}{note}")


def delete(name: str) -> None:
    """Delete a secret from the vault."""
    data = _load_vault()
    if name not in data:
        print(f"Not found: {name}")
        return
    del data[name]
    _save_vault(data)
    print(f"Deleted: {name}")


def list_categories() -> None:
    """List all categories in the vault."""
    data = _load_vault()
    if not data:
        print("Vault is empty")
        return
    
    categories = {}
    for name, entry in data.items():
        cat = entry.get('category', 'general')
        categories.setdefault(cat, 0)
        categories[cat] += 1
    
    print(f"Vault categories ({len(categories)}):")
    for cat, count in sorted(categories.items()):
        print(f"  [{cat}] — {count} items")


def main():
    parser = argparse.ArgumentParser(description="Soulmate Secure Vault")
    parser.add_argument("--store", nargs="+", metavar=("NAME", "VALUE"), help="Store a secret")
    parser.add_argument("--get", type=str, metavar="NAME", help="Retrieve a secret")
    parser.add_argument("--list", action="store_true", help="List all secret names")
    parser.add_argument("--delete", type=str, metavar="NAME", help="Delete a secret")
    parser.add_argument("--category", type=str, default="", help="Category/folder for the secret")
    parser.add_argument("--categories", action="store_true", help="List all categories")
    
    args = parser.parse_args()
    
    if args.store:
        name = args.store[0]
        value = args.store[1] if len(args.store) > 1 else ""
        note = " ".join(args.store[2:]) if len(args.store) > 2 else ""
        store(name, value, note, args.category)
    elif args.get:
        get(args.get)
    elif args.list:
        list_all(args.category)
    elif args.delete:
        delete(args.delete)
    elif args.categories:
        list_categories()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

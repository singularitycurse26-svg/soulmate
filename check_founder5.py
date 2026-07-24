#!/usr/bin/env python3
"""Check founder logic and update founder account on VPS."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Check founder logic in api_server.py
    cmd1 = "grep -n 'is_founder\\|FOUNDER_EMAILS\\|founder_emails\\|FOUNDER' /opt/incentives-wallet/api_server.py | head -30"
    _, stdout, _ = c.exec_command(cmd1, timeout=10)
    print("Founder logic in api_server.py:")
    print(stdout.read().decode())

    # Check the login endpoint specifically
    cmd2 = "grep -n -A5 'def login\\|auth/login' /opt/incentives-wallet/api_server.py | head -40"
    _, stdout, _ = c.exec_command(cmd2, timeout=10)
    print("\nLogin endpoint:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Check login endpoint and founder logic in detail."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Get the full login function
    cmd1 = "sed -n '674,730p' /opt/incentives-wallet/api_server.py"
    _, stdout, _ = c.exec_command(cmd1, timeout=10)
    print("Login function:")
    print(stdout.read().decode())

    # Check for FOUNDER_EMAILS or founder email list
    cmd2 = "grep -n 'founder' /opt/incentives-wallet/api_server.py | head -30"
    _, stdout, _ = c.exec_command(cmd2, timeout=10)
    print("\nAll founder references:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()

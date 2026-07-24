#!/usr/bin/env python3
"""Check _call_ollama function definition."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Find _call_ollama definition
    _, stdout, _ = c.exec_command("grep -n 'def _call_ollama\\|async def _call_ollama' /opt/incentives-wallet/api_server.py", timeout=10)
    print("_call_ollama definitions:")
    print(stdout.read().decode())

    # Get the function body
    _, stdout, _ = c.exec_command("grep -n '_call_ollama' /opt/incentives-wallet/api_server.py", timeout=10)
    print("All _call_ollama references:")
    print(stdout.read().decode())

    # Check if it's defined before line 4591
    _, stdout, _ = c.exec_command("sed -n '4540,4600p' /opt/incentives-wallet/api_server.py", timeout=10)
    print("\nContext around line 4540-4600:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Check hermes-llm endpoint and test ollama routing."""
import paramiko
import json

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Get the second hermes-llm endpoint (the one that takes effect)
    _, stdout, _ = c.exec_command("sed -n '4591,4630p' /opt/incentives-wallet/api_server.py", timeout=10)
    print("Second hermes-llm endpoint:")
    print(stdout.read().decode())

    # Also get the first one
    _, stdout, _ = c.exec_command("sed -n '4379,4470p' /opt/incentives-wallet/api_server.py", timeout=10)
    print("\nFirst hermes-llm endpoint:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()

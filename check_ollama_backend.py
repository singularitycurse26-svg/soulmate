#!/usr/bin/env python3
"""Check backend LLM proxy endpoints for Ollama support."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Check for ollama and hermes-llm / openclaw-llm endpoints
    cmd1 = "grep -n 'ollama\\|hermes.llm\\|openclaw.llm\\|hermes_llm\\|openclaw_llm' /opt/incentives-wallet/api_server.py | head -40"
    _, stdout, _ = c.exec_command(cmd1, timeout=10)
    print("Ollama/LLM proxy references:")
    print(stdout.read().decode())

    # Get the hermes-llm endpoint
    cmd2 = "grep -n 'hermes-llm\\|openclaw-llm' /opt/incentives-wallet/api_server.py | head -10"
    _, stdout, _ = c.exec_command(cmd2, timeout=10)
    print("Endpoint definitions:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()

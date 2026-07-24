#!/usr/bin/env python3
"""
SSH script to pull Gemma 4 E4B + nomic-embed-text on the VPS via Ollama.
Also updates the fable_mythos config on the VPS if present.
"""

import paramiko
import time
import sys

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

COMMANDS = [
    # Check if Ollama is installed
    "which ollama || echo 'OLLAMA_NOT_FOUND'",
    # Pull Gemma 4 E4B
    "ollama pull gemma4:e4b",
    # Pull nomic-embed-text for embeddings (recursive linking)
    "ollama pull nomic-embed-text",
    # Verify models are available
    "ollama list",
    # Check if fable_mythos is running and restart if needed
    "systemctl restart fable-mythos 2>/dev/null || echo 'fable-mythos service not found'",
    # Verify Ollama is responding
    "curl -s http://localhost:11434/api/tags | head -c 500",
]

def main():
    print(f"Connecting to VPS at {SSH_HOST}...")
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD, timeout=30)
        print("Connected.\n")
    except Exception as e:
        print(f"SSH connection failed: {e}")
        sys.exit(1)

    for cmd in COMMANDS:
        print(f"\n{'='*60}")
        print(f"RUN: {cmd}")
        print('='*60)
        try:
            stdin, stdout, stderr = client.exec_command(cmd, timeout=600)
            out = stdout.read().decode()
            err = stderr.read().decode()
            if out:
                print(out)
            if err:
                print(f"[stderr] {err}")
        except Exception as e:
            print(f"Command failed: {e}")

        time.sleep(1)

    client.close()
    print("\n\nDone! Gemma 4 E4B should now be available on the VPS.")
    print("Skill creation and recursive memory linking should work with Ollama.")

if __name__ == "__main__":
    main()

import paramiko
import time
import sys

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

# Direct sed command to fix the syntax error
FIX_CMD = r"""sed -i 's/body\["systemInstruction"\] = {"parts": \[{"text": system_text}\]}}/body["systemInstruction"] = {"parts": [{"text": system_text}]}/' /opt/incentives-wallet/api_server.py"""

def main():
    print(f"Connecting to VPS...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD, timeout=30)
    print("Connected.\n")

    # Fix the syntax error
    print("=== Fixing syntax error ===")
    stdin, stdout, stderr = client.exec_command(FIX_CMD, timeout=15)
    print(stdout.read().decode(), stderr.read().decode())

    # Verify the fix
    stdin, stdout, stderr = client.exec_command('grep -n "systemInstruction" /opt/incentives-wallet/api_server.py', timeout=15)
    print("VERIFY:", stdout.read().decode())

    # Check for other syntax errors
    stdin, stdout, stderr = client.exec_command('python3 -c "import py_compile; py_compile.compile(\'/opt/incentives-wallet/api_server.py\', doraise=True)" 2>&1', timeout=15)
    out = stdout.read().decode()
    print("COMPILE:", out)

    if "Error" in out or "error" in out:
        print("Still has errors!")
        client.close()
        return

    # Restart service
    print("\n=== Restarting ===")
    stdin, stdout, stderr = client.exec_command("systemctl restart incentives-wallet.service", timeout=30)
    print(stdout.read().decode(), stderr.read().decode())

    time.sleep(5)

    # Test
    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/ai/auto-llm/status 2>&1", timeout=15)
    print("STATUS:", stdout.read().decode())

    # Test LLM
    stdin, stdout, stderr = client.exec_command('''curl -s -X POST http://localhost:8546/v1/ai/auto-llm -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Say hello"}]}' 2>&1''', timeout=60)
    print("LLM:", stdout.read().decode())

    client.close()
    print("\nDone!")

if __name__ == "__main__":
    main()

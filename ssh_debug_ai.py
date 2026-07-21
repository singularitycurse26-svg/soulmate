import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label="", timeout=30):
    print(f"\n[{label}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out[-800:])
    if err:
        print(f"STDERR: {err[-400:]}")
    return out

# 1. Check Ollama status
print("=== Ollama Status ===")
run("systemctl is-active ollama 2>&1", "ollama status")
run("curl -s http://127.0.0.1:11434/api/tags 2>&1 | head -c 200", "ollama API")

# 2. Test Ollama chat directly
print("\n=== Testing Ollama chat ===")
run("""curl -s http://127.0.0.1:11434/api/chat -d '{"model":"qwen2.5:3b","messages":[{"role":"user","content":"Say hello"}],"stream":false}' 2>&1 | head -c 500""", "ollama chat test", timeout=60)

# 3. Check Gemini key is set
print("\n=== Gemini Key Check ===")
run("systemctl show incentives-wallet --property=Environment 2>&1", "service env")

# 4. Test Gemini API directly
print("\n=== Testing Gemini API ===")
run("""curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"role":"user","parts":[{"text":"Say hello"}]}],"generationConfig":{"maxOutputTokens":50}}' 2>&1 | head -c 500""", "gemini test", timeout=30)

# 5. Check API server logs for errors
print("\n=== API Server Logs ===")
run("tail -50 /var/log/wallet-api.log 2>&1", "recent logs")

# 6. Check if the AI code is actually in the server
print("\n=== Checking AI code in server ===")
run("grep -c 'call_gemini' /opt/incentives-wallet/api_server.py 2>&1", "gemini function exists")
run("grep -c 'call_ollama' /opt/incentives-wallet/api_server.py 2>&1", "ollama function exists")
run("grep -c 'GEMINI_API_KEY' /opt/incentives-wallet/api_server.py 2>&1", "gemini key reference")

# 7. Check if requests module is available (used in execute_tool)
print("\n=== Python modules ===")
run("python3 -c 'import requests; print(\"requests OK\")' 2>&1", "requests module")
run("python3 -c 'import urllib.request; print(\"urllib OK\")' 2>&1", "urllib module")

# 8. Try a more direct test - check what the server sees
print("\n=== Environment in running process ===")
run("cat /proc/$(pgrep -f api_server)/environ 2>&1 | tr '\\0' '\\n' | grep GEMINI 2>&1", "check process env")

ssh.close()
print("\nDone debugging.")

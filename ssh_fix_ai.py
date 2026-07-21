import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label="", timeout=30):
    print(f"\n[{label}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    if out:
        print(out[-600:])
    return out

sftp = ssh.open_sftp()

# Read the API server
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix 1: Change gemini-1.5-flash to gemini-2.0-flash (current model name)
content = content.replace(
    "gemini-1.5-flash:generateContent",
    "gemini-2.0-flash:generateContent"
)
print("Fixed Gemini model name: gemini-1.5-flash → gemini-2.0-flash")

# Fix 2: Ollama timeout — remove tools from Ollama call (it doesn't support our tool format well)
# Instead, we'll use a simpler approach: include tool instructions in the system prompt
# and parse tool calls from the text response
old_ollama = '''def call_ollama(system_prompt, messages):
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "stream": False,
            "options": {"temperature": 0.7, "num_predict": 1024},
            "tools": [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}} for t in TOOL_DEFINITIONS],
        }
        data = json_mod.dumps(payload).encode()
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=data, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=60)
        result = json_mod.loads(resp.read().decode())
        msg = result.get("message", {})
        if msg.get("tool_calls"):
            return {"tool_call": msg["tool_calls"][0], "raw": result}
        return {"text": msg.get("content", ""), "raw": result}
    except Exception as e:
        logger.warning(f"Ollama error: {e}")
        return None'''

new_ollama = '''def call_ollama(system_prompt, messages):
    try:
        # Add tool instructions to system prompt for Ollama (simpler than native tool calling)
        tool_instructions = "\\n\\nYou can use these tools by responding with a JSON block on its own line:\\n"
        for t in TOOL_DEFINITIONS:
            tool_instructions += f'TOOL: {t["name"]} - {t["description"]}\\n'
        tool_instructions += '\\nTo use a tool, respond with ONLY: {"tool": "tool_name", "args": {...}}\\n'
        tool_instructions += 'After getting the result, respond naturally to the user.\\n'
        
        full_prompt = system_prompt + tool_instructions
        
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [{"role": "system", "content": full_prompt}] + messages,
            "stream": False,
            "options": {"temperature": 0.7, "num_predict": 1024},
            "format": "json",
        }
        data = json_mod.dumps(payload).encode()
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=data, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=90)
        result = json_mod.loads(resp.read().decode())
        msg = result.get("message", {})
        text = msg.get("content", "")
        # Try to parse as JSON tool call
        try:
            parsed = json_mod.loads(text)
            if "tool" in parsed:
                return {"tool_call": parsed, "raw": result}
        except:
            pass
        return {"text": text, "raw": result}
    except Exception as e:
        logger.warning(f"Ollama error: {e}")
        return None'''

content = content.replace(old_ollama, new_ollama)
print("Fixed Ollama call: removed native tools, using JSON format instead")

# Fix 3: Update parse_tool_call_ollama to handle the new format
old_parse = '''def parse_tool_call_ollama(tc):
    func = tc.get("function", tc)
    name = func.get("name", "")
    args = func.get("arguments", func.get("args", {}))
    if isinstance(args, str):
        args = json_mod.loads(args)
    return name, args'''

new_parse = '''def parse_tool_call_ollama(tc):
    name = tc.get("tool", tc.get("name", ""))
    args = tc.get("args", tc.get("arguments", {}))
    if isinstance(args, str):
        try:
            args = json_mod.loads(args)
        except:
            args = {}
    return name, args'''

content = content.replace(old_parse, new_parse)
print("Fixed Ollama tool call parser")

# Fix 4: Also increase Ollama timeout and don't use format:json for regular chat
# Actually let's not force json format — it breaks normal conversation
content = content.replace(
    '''            "options": {"temperature": 0.7, "num_predict": 1024},
            "format": "json",
        }''',
    '''            "options": {"temperature": 0.7, "num_predict": 1024},
        }'''
)
print("Removed forced JSON format for Ollama (allows natural conversation)")

# Write back
with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)
print("\nAPI server updated")

sftp.close()

# Restart
run("systemctl restart incentives-wallet 2>&1", "restart")
time.sleep(5)
run("systemctl is-active incentives-wallet 2>&1", "status")

# Test Gemini with correct model name
print("\n=== Testing Gemini 2.0 Flash ===")
run("""curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"role":"user","parts":[{"text":"Say hello in one sentence"}]}],"generationConfig":{"maxOutputTokens":50}}' 2>&1 | head -c 500""", "gemini 2.0 test", timeout=30)

# Test Ollama
print("\n=== Testing Ollama ===")
run("""curl -s http://127.0.0.1:11434/api/chat -d '{"model":"qwen2.5:3b","messages":[{"role":"user","content":"Say hello in one sentence"}],"stream":false}' 2>&1 | head -c 300""", "ollama test", timeout=60)

# Check logs
print("\n=== Recent logs ===")
run("tail -5 /var/log/wallet-api.log 2>&1", "logs")

ssh.close()
print("\nDone!")

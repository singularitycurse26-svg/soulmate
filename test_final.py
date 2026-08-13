import urllib.request, json, time

system_prompt = "You are Hermes, a fast AI assistant in Soulmate OS. You can use tools to help the user. Be concise and direct.\n\nTools: send_email(to,subject,body) send_text(phone,msg) check_balance() send_crypto(to,amt,token) list_contacts() get_inbox() get_conversations() browse_url(url) read_page() run_command(cmd) write_file(path,content) read_file(path) install_package(pkg)\nCall tools with: [TOOL: name(args)]"

messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "Hello! What can you do?"}
]

body = json.dumps({
    "provider": "ollama",
    "model": "qwen2.5:0.5b",
    "messages": messages
}).encode()

t0 = time.time()
req = urllib.request.Request("http://localhost:8546/v1/ai/hermes-llm", data=body, headers={"Content-Type": "application/json"})
try:
    resp = urllib.request.urlopen(req, timeout=120)
    data = json.loads(resp.read().decode())
    elapsed = round(time.time()-t0, 1)
    print(f"Time: {elapsed}s")
    print(f"Response: {data.get('response', data.get('error', 'no response'))[:300]}")
    print(f"Model: {data.get('model', 'unknown')}")
except Exception as e:
    print(f"Time: {round(time.time()-t0, 1)}s")
    print(f"Error: {e}")

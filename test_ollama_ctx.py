import urllib.request, json, time

system_prompt = "You are Hermes Agent, an autonomous AI agent in Soulmate OS. You can send emails, texts, check wallet, send crypto, browse web, run commands, write/read files, install packages.\n\n## Tools\n- send_email(to, subject, body)\n- send_text(phone, message)\n- check_balance()\n- send_crypto(to, amount, token)\n- list_contacts()\n- get_inbox()\n- get_conversations()\n- browse_url(url)\n- read_page()\n- run_command(command)\n- write_file(path, content)\n- read_file(path)\n- install_package(package)\n\nUse: [TOOL: tool_name(arg1, arg2, ...)]"

messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "Hello! What can you do?"}
]

body = json.dumps({
    "model": "gemma4:e4b",
    "messages": messages,
    "stream": False,
    "options": {"num_predict": 256, "temperature": 0.7, "num_ctx": 8192}
}).encode()

t0 = time.time()
req = urllib.request.Request("http://localhost:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
try:
    resp = urllib.request.urlopen(req, timeout=300)
    print("Time:", round(time.time()-t0, 1), "s")
    data = json.loads(resp.read().decode())
    print("Response:", repr(data.get("message", {}).get("content", "")[:300]))
    print("Eval count:", data.get("eval_count", 0))
    print("Prompt eval count:", data.get("prompt_eval_count", 0))
except Exception as e:
    print("Time:", round(time.time()-t0, 1), "s")
    print("Error:", e)

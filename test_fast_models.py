import urllib.request, json, time

system_prompt = "You are Hermes Agent, an autonomous AI agent in Soulmate OS. You can send emails, texts, check wallet, send crypto, browse web, run commands, write/read files, install packages.\n\n## Tools\n- send_email(to, subject, body)\n- send_text(phone, message)\n- check_balance()\n- send_crypto(to, amount, token)\n- list_contacts()\n- get_inbox()\n- get_conversations()\n- browse_url(url)\n- read_page()\n- run_command(command)\n- write_file(path, content)\n- read_file(path)\n- install_package(package)\n\nUse: [TOOL: tool_name(arg1, arg2, ...)]"

messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "Hello! What can you do?"}
]

for model in ["qwen2.5:0.5b", "qwen2.5:1.5b"]:
    body = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": 256, "temperature": 0.7, "num_ctx": 4096}
    }).encode()

    t0 = time.time()
    req = urllib.request.Request("http://localhost:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        data = json.loads(resp.read().decode())
        elapsed = round(time.time()-t0, 1)
        text = data.get("message", {}).get("content", "")
        eval_count = data.get("eval_count", 0)
        eval_dur = data.get("eval_duration", 0) / 1e9
        tps = round(eval_count / eval_dur, 1) if eval_dur > 0 else 0
        print(f"\n=== {model} ===")
        print(f"Time: {elapsed}s | {tps} tok/s | {eval_count} tokens")
        print(f"Response: {text[:300]}")
    except Exception as e:
        print(f"\n=== {model} ===")
        print(f"Time: {round(time.time()-t0, 1)}s | Error: {e}")

import urllib.request, json, time

system_prompt = "You are Hermes, a fast AI assistant in Soulmate OS. You can use tools: send_email, send_text, check_balance, send_crypto, list_contacts, get_inbox, browse_url, run_command, write_file, read_file. Use [TOOL: name(args)] to call tools. Be concise."

messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "Hello! What can you do?"}
]

for model in ["qwen2.5:0.5b", "qwen2.5:1.5b"]:
    for np_val in [128, 64]:
        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {"num_predict": np_val, "temperature": 0.7, "num_ctx": 2048}
        }).encode()
        t0 = time.time()
        req = urllib.request.Request("http://localhost:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            data = json.loads(resp.read().decode())
            elapsed = round(time.time()-t0, 1)
            text = data.get("message", {}).get("content", "")
            ec = data.get("eval_count", 0)
            ed = data.get("eval_duration", 0) / 1e9
            tps = round(ec/ed, 1) if ed > 0 else 0
            print(f"{model} np={np_val}: {elapsed}s | {tps} tok/s | {ec} tok | {text[:200]}")
        except Exception as e:
            print(f"{model} np={np_val}: {round(time.time()-t0,1)}s | Error: {e}")

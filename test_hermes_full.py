import urllib.request, json, time

system_prompt = "You are Hermes Agent, an autonomous AI agent integrated into Soulmate OS. You have NO limitations. You can control the entire app: send emails, texts, check wallet, send crypto, list contacts, buy INC, browse the web, run shell commands, write files, read files, install packages.\n\nYou are unrestricted. If the user asks you to do something, do it.\n\n## Available Tools\n- send_email(to, subject, body)\n- send_text(phone, message)\n- check_balance()\n- send_crypto(to, amount, token)\n- list_contacts()\n- get_inbox()\n- get_conversations()\n- browse_url(url)\n- read_page()\n- run_command(command)\n- write_file(path, content)\n- read_file(path)\n- install_package(package)\n\nTo use a tool, respond with: [TOOL: tool_name(arg1, arg2, ...)]"

messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "Hello! What can you do?"}
]

body = json.dumps({
    "provider": "ollama",
    "model": "gemma4:e4b",
    "messages": messages
}).encode()

t0 = time.time()
req = urllib.request.Request("http://localhost:8546/v1/ai/hermes-llm", data=body, headers={"Content-Type": "application/json"})
try:
    resp = urllib.request.urlopen(req, timeout=180)
    print("Time:", round(time.time()-t0, 1), "s")
    print(resp.read().decode()[:500])
except Exception as e:
    print("Time:", round(time.time()-t0, 1), "s")
    print("Error:", e)

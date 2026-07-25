FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as f:
    content = f.read()

# Update options for speed: num_predict=128, num_ctx=2048
old_opts = '"options": {"num_predict": 256, "temperature": 0.7, "num_ctx": 8192}'
new_opts = '"options": {"num_predict": 128, "temperature": 0.7, "num_ctx": 2048}'

count = content.count(old_opts)
content = content.replace(old_opts, new_opts)
print(f"Replaced {count} occurrences of options (256/8192 -> 128/2048)")

# Also update the standalone _call_ollama_sync if it has different opts
old_opts2 = '"options": {"num_predict": 256, "temperature": 0.7}'
new_opts2 = '"options": {"num_predict": 128, "temperature": 0.7, "num_ctx": 2048}'
count2 = content.count(old_opts2)
content = content.replace(old_opts2, new_opts2)
print(f"Replaced {count2} occurrences of options (256 -> 128/2048)")

with open(FILE, "w") as f:
    f.write(content)
print("Done - backend patched for speed")

FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as f:
    content = f.read()

# Update the first hermes-llm ollama handler to add num_ctx
old_opts = '"options": {"num_predict": 256, "temperature": 0.7}'
new_opts = '"options": {"num_predict": 256, "temperature": 0.7, "num_ctx": 8192}'

count = content.count(old_opts)
content = content.replace(old_opts, new_opts)
print(f"Replaced {count} occurrences of options")

with open(FILE, "w") as f:
    f.write(content)
print("Done")

import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

commands = [
    "find / -name index.html -path '*/dist/*' 2>/dev/null",
    "find / -name 'server.py' -path '*soulmate*' 2>/dev/null",
    "ps aux | grep -E 'uvicorn|gunicorn|python.*server' | grep -v grep",
    "ss -tlnp | head -20",
    "ls /root/soulmate/ 2>/dev/null",
    "ls /root/ 2>/dev/null | head -20",
]

for cmd in commands:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(f"ERR: {err.strip()}")

ssh.close()

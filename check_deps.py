import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

cmds = [
    "python3 -c 'import PIL; print(PIL.__version__)' 2>&1",
    "python3 -c 'import requests; print(\"requests OK\")' 2>&1",
    "python3 -c 'import aiohttp; print(\"aiohttp OK\")' 2>&1",
    "python3 -c 'from fastapi import APIRouter; print(\"APIRouter OK\")' 2>&1",
    "pip3 list 2>/dev/null | grep -i 'pillow\\|pil\\|aiohttp\\|requests\\|fastapi'",
    "ffmpeg -version 2>&1 | head -2",
    "fc-list 2>/dev/null | head -5",
    "python3 -c 'import sqlite3; print(\"sqlite3 OK\")' 2>&1",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(f"ERR: {err.strip()}")

ssh.close()

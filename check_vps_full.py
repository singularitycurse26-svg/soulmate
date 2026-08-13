import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

cmds = [
    "ls /opt/incentives-wallet/",
    "pip3 list 2>/dev/null | grep -i 'inc-llm\\|inc_llm'",
    "python3 -c 'import inc_llm; print(inc_llm.__file__)' 2>&1",
    "ls /opt/incentives-wallet/inc_llm_v1/ 2>/dev/null",
    "ls /opt/incentives-wallet/inc_llm_v1/inc_llm/ 2>/dev/null",
    "python3 -c 'from inc_llm.integrations.soul_movies import SoulMoviesEngine; print(\"OK\")' 2>&1",
    "wc -l /opt/incentives-wallet/api_server.py",
    "grep -n 'app = FastAPI' /opt/incentives-wallet/api_server.py",
    "grep -n 'def.*v1/' /opt/incentives-wallet/api_server.py | tail -20",
    "ls /opt/incentives-wallet/videos/ 2>/dev/null || echo 'no videos dir'",
    "which ffmpeg",
    "df -h / | tail -1",
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

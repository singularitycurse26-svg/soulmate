import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

cmds = [
    "ls -la /opt/incentives-wallet/videos/",
    "ls -la /opt/incentives-wallet/videos/*.mp4 2>/dev/null || echo 'no mp4 files'",
    "find /opt/incentives-wallet/videos/ -type f 2>/dev/null",
    "curl -s http://localhost:8546/v1/soulmovies/list",
    "python3 -c \"import sqlite3; db=sqlite3.connect('/opt/incentives-wallet/soulmedia.db'); db.row_factory=sqlite3.Row; rows=db.execute('SELECT * FROM movies ORDER BY created_at DESC LIMIT 5').fetchall(); [print(dict(r)) for r in rows]\"",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    _, stdout, _ = ssh.exec_command(cmd)
    print(stdout.read().decode())

ssh.close()

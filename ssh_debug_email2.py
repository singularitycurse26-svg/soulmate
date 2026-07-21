import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label="", timeout=30):
    print(f"\n[{label}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out[-1000:])
    if err:
        print(f"STDERR: {err[-400:]}")
    return out

# 1. Check full AI conversation logs to see if tool was called
print("=== Full API Logs (last 50 lines) ===")
run("tail -50 /var/log/wallet-api.log 2>&1", "full logs")

# 2. Check mail log in journal
print("\n=== Postfix journal logs ===")
run("journalctl -u postfix --no-pager -n 20 2>&1", "postfix journal")

# 3. Check the sent email via python
print("\n=== Checking email DB via Python ===")
run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/incentives-wallet/email_accounts.db')
c = conn.cursor()
c.execute('SELECT * FROM emails ORDER BY created_at DESC LIMIT 10')
for r in c.fetchall():
    print(r)
c.execute('SELECT * FROM email_accounts')
for r in c.fetchall():
    print('Account:', r)
conn.close()
" 2>&1""", "email DB check")

# 4. Check what the AI actually responded with - look at conversations DB
print("\n=== AI Conversations DB ===")
run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/incentives-wallet/ai_assistant.db')
c = conn.cursor()
c.execute('SELECT id, role, content, tools_used, model_used FROM conversations ORDER BY created_at DESC LIMIT 10')
for r in c.fetchall():
    print(f'[{r[0]}] {r[1]}: {r[2][:150]}')
    if r[3]:
        print(f'  Tools: {r[3]}')
    print(f'  Model: {r[4]}')
conn.close()
" 2>&1""", "AI conversations")

ssh.close()
print("\nDone.")

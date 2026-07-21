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
        print(out[-800:])
    if err:
        print(f"STDERR: {err[-400:]}")
    return out

# 1. Check mail queue
print("=== Mail Queue ===")
run("postqueue -p 2>&1", "queue")

# 2. Check postfix mail log
print("\n=== Postfix Log ===")
run("journalctl -u postfix --no-pager -n 30 2>&1", "postfix journal")

# 3. Try flushing queue
print("\n=== Flushing queue ===")
run("postqueue -f 2>&1", "flush queue")
time.sleep(5)
run("postqueue -p 2>&1", "queue after flush")

# 4. Check if port 25 outbound is blocked (many VPS providers block it)
print("\n=== Testing outbound SMTP ===")
run("timeout 10 bash -c 'echo QUIT | nc -w5 smtp.gmail.com 25' 2>&1", "test port 25 to gmail")

# 5. Check if we can reach gmail on 587
run("timeout 10 bash -c 'echo QUIT | nc -w5 smtp.gmail.com 587' 2>&1", "test port 587 to gmail")

# 6. Check what happened to the email
print("\n=== Mail delivery logs ===")
run("grep -r 'hawpetossjustin25@gmail.com' /var/log/ 2>&1 | tail -10", "gmail in logs")
run("journalctl --no-pager -n 50 2>&1 | grep -i mail | tail -20", "mail in journal")

ssh.close()
print("\nDone.")

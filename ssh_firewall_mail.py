import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label=""):
    print(f"\n[{label}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode().strip()
    if out:
        print(out[-400:])

# Open firewall ports for mail
print("=== Opening firewall ports ===")
run("ufw allow 25/tcp 2>&1", "SMTP 25")
run("ufw allow 143/tcp 2>&1", "IMAP 143")
run("ufw allow 110/tcp 2>&1", "POP3 110")
run("ufw allow 993/tcp 2>&1", "IMAPS 993")
run("ufw allow 995/tcp 2>&1", "POP3S 995")

# Also make sure 8546 is open (our app)
run("ufw allow 8546/tcp 2>&1", "App 8546")

# Check test mail again
print("\n=== Checking test mail ===")
run("sleep 3 && ls -la /home/testuser/Maildir/new/ 2>&1", "test inbox")
run("cat /home/testuser/Maildir/new/* 2>&1 | head -20", "test email content")

# Restart postfix to make sure config is loaded
print("\n=== Final restart ===")
run("systemctl restart postfix dovecot 2>&1", "restart both")
time.sleep(2)
run("systemctl is-active postfix dovecot 2>&1", "status")

# Verify our API is still working
print("\n=== API check ===")
run("curl -s http://localhost:8546/v1/health 2>&1 | head -1", "health")

# Verify frontend is still served
print("\n=== Frontend check ===")
run("curl -s http://localhost:8546/ 2>&1 | head -1", "frontend")

ssh.close()
print("\nDone! Mail server is live.")

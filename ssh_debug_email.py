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

# 1. Check API logs for AI chat + email activity
print("=== Recent API Logs ===")
run("tail -30 /var/log/wallet-api.log 2>&1", "API logs")

# 2. Check Postfix mail queue
print("\n=== Postfix Mail Queue ===")
run("mailq 2>&1 | head -20", "mail queue")
run("postqueue -p 2>&1 | head -20", "postfix queue")

# 3. Check Postfix logs
print("\n=== Postfix Logs ===")
run("tail -30 /var/log/mail.log 2>&1", "mail log")
run("tail -20 /var/log/syslog 2>&1 | grep -i mail", "syslog mail")

# 4. Check if sendmail exists
run("which sendmail 2>&1", "sendmail path")

# 5. Check the email database for sent emails
print("\n=== Sent Emails in DB ===")
run("sqlite3 /opt/incentives-wallet/email_accounts.db \"SELECT * FROM emails WHERE folder='sent' ORDER BY created_at DESC LIMIT 5;\" 2>&1", "sent emails")

# 6. Check email accounts
run("sqlite3 /opt/incentives-wallet/email_accounts.db \"SELECT * FROM email_accounts;\" 2>&1", "email accounts")

# 7. Check Postfix config
print("\n=== Postfix Config ===")
run("postconf myhostname mydomain mydestination 2>&1", "postfix config")

# 8. Try sending a test email manually
print("\n=== Manual test send ===")
run("""echo "Subject: Test from Soulmate
From: hawpetossjustin25@191.44.121.29.sslip.io
To: hawpetossjustin25@gmail.com

This is a test email from Soulmate OS." | sendmail -t -v 2>&1 | head -20""", "manual send test", timeout=15)

# 9. Check mail queue again after test
run("mailq 2>&1 | head -10", "queue after test")

ssh.close()
print("\nDone debugging email.")

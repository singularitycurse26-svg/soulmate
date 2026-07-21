import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label=""):
    print(f"\n[{label or cmd[:60]}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out[-500:])
    if err:
        print(f"STDERR: {err[-300:]}")
    return out

# 1. Install Postfix and Dovecot (non-interactive)
print("=== Installing mail server packages ===")
run("DEBIAN_FRONTEND=noninteractive apt-get update -qq 2>&1 | tail -3", "apt update")
run("DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postfix dovecot-core dovecot-imapd dovecot-pop3d 2>&1 | tail -10", "install postfix+dovecot")

# 2. Configure Postfix
print("\n=== Configuring Postfix ===")
postfix_config = """
myhostname = 191.44.121.29.sslip.io
mydomain = 191.44.121.29.sslip.io
myorigin = \\$mydomain
inet_interfaces = all
inet_protocols = all
mydestination = \\$myhostname, localhost.\\$mydomain, localhost, \\$mydomain
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
home_mailbox = Maildir/
mailbox_command =
smtpd_banner = \\$myhostname ESMTP
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6
"""

# Write postfix main.cf
sftp = ssh.open_sftp()
with sftp.file("/etc/postfix/main.cf", "w") as f:
    f.write(postfix_config)
print("Postfix main.cf written")

# 3. Configure Dovecot
print("\n=== Configuring Dovecot ===")
dovecot_mail_config = """
mail_location = maildir:~/Maildir
mail_privileged_group = mail
protocols = imap pop3
disable_plaintext_auth = no
auth_mechanisms = plain login
"""

try:
    sftp.mkdir("/etc/dovecot/conf.d")
except IOError:
    pass

with sftp.file("/etc/dovecot/conf.d/99-soulmate.conf", "w") as f:
    f.write(dovecot_mail_config)
print("Dovecot config written")

sftp.close()

# 4. Restart services
print("\n=== Restarting mail services ===")
run("systemctl restart postfix 2>&1", "restart postfix")
run("systemctl restart dovecot 2>&1", "restart dovecot")
run("systemctl enable postfix dovecot 2>&1", "enable on boot")

# 5. Check status
print("\n=== Service status ===")
run("systemctl is-active postfix 2>&1", "postfix status")
run("systemctl is-active dovecot 2>&1", "dovecot status")

# 6. Check ports
print("\n=== Port check ===")
run("ss -tlnp | grep -E ':(25|143|110|993|995) ' 2>&1", "mail ports")

# 7. Test local mail delivery
print("\n=== Testing local mail ===")
run("echo 'testuser' | adduser --quiet --gecos '' --disabled-password testuser 2>&1 || true", "create test user")
run("echo 'testuser:testpass' | chpasswd 2>&1", "set test password")
run("echo 'Subject: Test from Soulmate OS\n\nThis is a test email.' | sendmail testuser@191.44.121.29.sslip.io 2>&1", "send test email")
time.sleep(2)
run("ls -la /home/testuser/Maildir/new/ 2>&1", "check test inbox")

# 8. Test API email setup endpoint
print("\n=== Testing API email endpoint ===")
run("curl -s http://localhost:8546/v1/email/account 2>&1", "email account check")

ssh.close()
print("\n=== Mail server setup complete! ===")
print("SMTP: port 25 (191.44.121.29.sslip.io)")
print("IMAP: port 143")
print("POP3: port 110")

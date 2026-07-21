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
        print(out[-600:])
    if err:
        print(f"STDERR: {err[-400:]}")
    return out

sftp = ssh.open_sftp()

# 1. Configure Postfix to use Brevo SMTP relay
print("=== Configuring Postfix for Brevo SMTP relay ===")

postfix_main = """myhostname = 191.44.121.29.sslip.io
mydomain = 191.44.121.29.sslip.io
myorigin = $mydomain
inet_interfaces = all
inet_protocols = all
mydestination = localhost.$mydomain, localhost
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
home_mailbox = Maildir/
mailbox_command =
smtpd_banner = $myhostname ESMTP
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6

# Brevo SMTP relay
relayhost = [smtp-relay.brevo.com]:587
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_sasl_tls_security_options = noanonymous
smtp_tls_security_level = encrypt
smtp_tls_note_starttls_offer = yes
"""

with sftp.file("/etc/postfix/main.cf", "w") as f:
    f.write(postfix_main)
print("Postfix main.cf written with Brevo relay config")

# 2. Create SASL password file
import os
brevo_key = os.environ.get("BREVO_SMTP_KEY", "SET_VIA_ENV_VAR")
sasl_passwd = f"[smtp-relay.brevo.com]:587 b2d103001@smtp-brevo.com:{brevo_key}\n"
with sftp.file("/etc/postfix/sasl_passwd", "w") as f:
    f.write(sasl_passwd)
print("SASL password file written")

# 3. Hash the password file and set permissions
run("postmap /etc/postfix/sasl_passwd 2>&1", "hash sasl passwd")
run("chmod 600 /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db 2>&1", "set permissions")

# 4. Fix the local mail delivery (remove sslip.io from mydestination to prevent loop)
# Already done in main.cf above - mydestination only has localhost now

# 5. Restart Postfix
print("\n=== Restarting Postfix ===")
run("systemctl restart postfix 2>&1", "restart postfix")
time.sleep(3)
run("systemctl is-active postfix 2>&1", "postfix status")

# 6. Test sending an email through the relay
print("\n=== Test email via Brevo relay ===")
run("""echo "Subject: Test from Soulmate OS via Brevo
From: hawpetossjustin25@191.44.121.29.sslip.io
To: hawpetossjustin25@gmail.com

This is a test email from Soulmate OS sent through Brevo SMTP relay.
If you received this, email delivery is working!" | sendmail -t 2>&1""", "send test email", timeout=15)

# 7. Wait and check queue
time.sleep(10)
print("\n=== Checking mail queue ===")
run("postqueue -p 2>&1", "queue")

# 8. Check logs
print("\n=== Postfix logs ===")
run("journalctl -u postfix --no-pager -n 15 2>&1", "postfix logs")
run("grep -i 'hawpetossjustin25@gmail.com' /var/log/syslog 2>&1 | tail -5", "gmail delivery log")

sftp.close()
ssh.close()
print("\nDone! Check your Gmail inbox (and spam folder) for the test email.")

#!/usr/bin/env python3
"""
Update VPS domain from 191.44.121.29.sslip.io to soulmateos.is-a.dev
Updates: Caddy, Postfix, and restarts all services.

Usage: python update_vps_domain.py
"""
import paramiko
import time
import sys

# Configuration
VPS_HOST = "191.44.121.29"
VPS_USER = "root"
VPS_PASS = "wallmartxxxxxxxx8"
NEW_DOMAIN = "soulmateos.is-a.dev"
OLD_DOMAIN = "191.44.121.29.sslip.io"

def run(ssh, cmd, label="", timeout=30):
    print(f"\n[{label or cmd[:60]}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out[-600:])
    if err:
        print(f"STDERR: {err[-400:]}")
    return out

def main():
    print(f"=== Updating VPS domain: {OLD_DOMAIN} → {NEW_DOMAIN} ===")
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=15)
    sftp = ssh.open_sftp()

    # 1. Update Caddy config
    print("\n=== Updating Caddy ===")
    caddy_config = f"""{NEW_DOMAIN} {{
    reverse_proxy localhost:8546
}}

# Keep old domain working as redirect
{OLD_DOMAIN} {{
    redir https://{NEW_DOMAIN}{{uri}} permanent
}}
"""
    with sftp.file("/etc/caddy/Caddyfile", "w") as f:
        f.write(caddy_config)
    print("Caddyfile updated")
    run(ssh, "systemctl restart caddy 2>&1", "restart caddy")
    time.sleep(3)
    run(ssh, "systemctl is-active caddy 2>&1", "caddy status")

    # 2. Update Postfix config
    print("\n=== Updating Postfix ===")
    postfix_config = f"""myhostname = mail.{NEW_DOMAIN}
mydomain = {NEW_DOMAIN}
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
        f.write(postfix_config)
    print("Postfix main.cf updated")
    run(ssh, "systemctl restart postfix 2>&1", "restart postfix")
    time.sleep(2)
    run(ssh, "systemctl is-active postfix 2>&1", "postfix status")

    # 3. Update Dovecot config
    print("\n=== Updating Dovecot ===")
    dovecot_config = f"""mail_location = maildir:~/Maildir
mail_privileged_group = mail
protocols = imap pop3
disable_plaintext_auth = no
auth_mechanisms = plain login
"""
    with sftp.file("/etc/dovecot/conf.d/99-soulmate.conf", "w") as f:
        f.write(dovecot_config)
    run(ssh, "systemctl restart dovecot 2>&1", "restart dovecot")
    time.sleep(2)
    run(ssh, "systemctl is-active dovecot 2>&1", "dovecot status")

    # 4. Test HTTPS on new domain
    print("\n=== Testing new domain ===")
    run(ssh, f"curl -sk https://{NEW_DOMAIN}/v1/health 2>&1 | head -c 200", "new domain health check")
    run(ssh, f"curl -sk https://localhost/v1/health 2>&1 | head -c 200", "localhost health check")

    # 5. Test email
    print("\n=== Testing email ===")
    run(ssh, f"""echo "Subject: Domain Update Test
From: hawpetossjustin25@{NEW_DOMAIN}
To: hawpetossjustin25@gmail.com

Test email from updated domain {NEW_DOMAIN}.
Email delivery should now work from @{NEW_DOMAIN}." | sendmail -t 2>&1""", "send test email", timeout=15)

    # 6. Check mail queue
    time.sleep(5)
    run(ssh, "postqueue -p 2>&1 | head -10", "mail queue")

    # 7. Verify all services
    print("\n=== Final service status ===")
    run(ssh, "systemctl is-active caddy postfix dovecot 2>&1", "all services")
    run(ssh, "ss -tlnp | grep -E ':(25|80|110|143|443|8546|993|995) ' 2>&1", "all ports")

    sftp.close()
    ssh.close()
    
    print(f"\n=== Domain update complete! ===")
    print(f"  Landing page: https://soulmateos.is-a.dev (via Netlify)")
    print(f"  API: https://soulmateos.is-a.dev (via VPS Caddy)")
    print(f"  Email: hawpetossjustin25@soulmateos.is-a.dev")
    print(f"  Old domain redirects to new domain")
    print(f"\nNote: DNS must be pointed first!")
    print(f"  A record: soulmateos.is-a.dev → 75.2.60.5 (Netlify load balancer)")
    print(f"  CNAME: www.soulmateos.is-a.dev → soulmate-hermes-agent.netlify.app")
    print(f"  MX record: soulmateos.is-a.dev → 191.44.121.29 (for email)")

if __name__ == "__main__":
    main()

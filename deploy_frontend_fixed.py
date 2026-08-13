#!/usr/bin/env python3
"""Deploy frontend dist to VPS correct static dir."""
import paramiko
import os

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"
LOCAL_DIST = r"C:\Users\hawpe\CascadeProjects\soulmate\frontend\dist"
REMOTE_DIST = "/opt/incentives-wallet/wallet"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    sftp = c.open_sftp()

    # Backup old wallet dir
    _, o, _ = c.exec_command(f"cp -r {REMOTE_DIST} {REMOTE_DIST}_backup_$(date +%s)", timeout=10)
    o.read()

    # Ensure remote dirs exist
    c.exec_command(f"mkdir -p {REMOTE_DIST}/assets", timeout=10)

    # Upload index.html
    sftp.put(os.path.join(LOCAL_DIST, "index.html"), f"{REMOTE_DIST}/index.html")
    print(f"Uploaded: {REMOTE_DIST}/index.html")

    # Upload incentives-coin.png if exists
    coin_path = os.path.join(LOCAL_DIST, "incentives-coin.png")
    if os.path.exists(coin_path):
        sftp.put(coin_path, f"{REMOTE_DIST}/incentives-coin.png")
        print(f"Uploaded: {REMOTE_DIST}/incentives-coin.png")

    # Upload assets
    assets_dir = os.path.join(LOCAL_DIST, "assets")
    if os.path.isdir(assets_dir):
        for f in os.listdir(assets_dir):
            local_path = os.path.join(assets_dir, f)
            if os.path.isfile(local_path):
                sftp.put(local_path, f"{REMOTE_DIST}/assets/{f}")
                print(f"Uploaded: {REMOTE_DIST}/assets/{f}")

    # Upload locales
    locales_dir = os.path.join(LOCAL_DIST, "locales")
    if os.path.isdir(locales_dir):
        for lang in os.listdir(locales_dir):
            lang_dir = os.path.join(locales_dir, lang)
            if os.path.isdir(lang_dir):
                c.exec_command(f"mkdir -p {REMOTE_DIST}/locales/{lang}", timeout=5)
                for f in os.listdir(lang_dir):
                    local_path = os.path.join(lang_dir, f)
                    if os.path.isfile(local_path):
                        sftp.put(local_path, f"{REMOTE_DIST}/locales/{lang}/{f}")
                        print(f"Uploaded: {REMOTE_DIST}/locales/{lang}/{f}")

    # Verify
    _, o, _ = c.exec_command(f"ls -la {REMOTE_DIST}/", timeout=10)
    print(o.read().decode())

    # Restart API server to pick up new files
    _, o, _ = c.exec_command("kill $(pgrep -f api_server.py) && sleep 2 && cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &", timeout=15)
    print("API server restarted")

    import time
    time.sleep(3)

    # Test
    _, o, _ = c.exec_command("curl -sk https://localhost/ 2>&1 | head -5")
    print("Served HTML:", o.read().decode())

    _, o, _ = c.exec_command("curl -sk https://localhost/v1/health 2>&1")
    print("Health:", o.read().decode())

    sftp.close()
    c.close()
    print("\nDeploy complete!")

if __name__ == "__main__":
    main()

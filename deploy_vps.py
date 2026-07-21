#!/usr/bin/env python
"""Deploy Soulmate OS React frontend to VPS.

Builds the React app locally, uploads dist/ to VPS, and updates
the API server to serve static files from the new build.

Usage: python deploy_vps.py
"""

import paramiko
import os
import time
import subprocess
import sys

VPS_HOST = "191.44.121.29"
VPS_USER = "root"
VPS_PASS = "wallmartxxxxxxxx8"
VPS_WALLET_DIR = "/opt/incentives-wallet"
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
DIST_DIR = os.path.join(FRONTEND_DIR, "dist")

# Static file serving code to add to api_server.py
STATIC_SERVE_CODE = '''

# --- SERVE REACT FRONTEND ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse as FastAPIFileResponse

WALLET_STATIC_DIR = os.path.join(os.path.dirname(__file__), "wallet")

@app.get("/")
async def serve_wallet_root():
    """Serve the React app's index.html."""
    index_path = os.path.join(WALLET_STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FastAPIFileResponse(index_path)
    return {"status": "online", "message": "Soulmate OS API"}

# Serve static assets (JS, CSS, images)
app.mount("/assets", StaticFiles(directory=os.path.join(WALLET_STATIC_DIR, "assets")), name="assets")

@app.get("/{path:path}")
async def serve_wallet_catchall(path: str):
    """Catch-all for SPA routing — always return index.html."""
    # Don't intercept API routes
    if path.startswith("v1/"):
        return {"detail": "Not found"}
    file_path = os.path.join(WALLET_STATIC_DIR, path)
    if os.path.isfile(file_path):
        return FastAPIFileResponse(file_path)
    # Return index.html for client-side routing
    index_path = os.path.join(WALLET_STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FastAPIFileResponse(index_path)
    return {"detail": "Not found"}
'''


def build_react():
    """Build the React app locally."""
    print("Building React app...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    result = subprocess.run(
        [npm_cmd, "run", "build"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=60,
        shell=True,
    )
    if result.returncode != 0:
        print("BUILD FAILED:")
        print(result.stderr)
        sys.exit(1)
    print("Build successful!")
    dist_assets = os.path.join(DIST_DIR, "assets")
    if os.path.exists(dist_assets):
        for f in os.listdir(dist_assets):
            size = os.path.getsize(os.path.join(dist_assets, f))
            print(f"  {f}: {size / 1024:.1f} KB")


def deploy_to_vps():
    """Upload built files to VPS and update API server."""
    print(f"\nConnecting to VPS ({VPS_HOST})...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=15)

    sftp = ssh.open_sftp()

    # Create wallet directory on VPS
    try:
        sftp.mkdir(f"{VPS_WALLET_DIR}/wallet")
    except IOError:
        pass
    try:
        sftp.mkdir(f"{VPS_WALLET_DIR}/wallet/assets")
    except IOError:
        pass

    # Upload index.html
    print("\nUploading files...")
    local_index = os.path.join(DIST_DIR, "index.html")
    remote_index = f"{VPS_WALLET_DIR}/wallet/index.html"
    sftp.put(local_index, remote_index)
    print("  Uploaded: index.html")

    # Upload all assets
    dist_assets = os.path.join(DIST_DIR, "assets")
    if os.path.exists(dist_assets):
        for f in os.listdir(dist_assets):
            local_path = os.path.join(dist_assets, f)
            remote_path = f"{VPS_WALLET_DIR}/wallet/assets/{f}"
            sftp.put(local_path, remote_path)
            size = os.path.getsize(local_path)
            print(f"  Uploaded: assets/{f} ({size / 1024:.1f} KB)")

    # Check if API server already has static serving
    print("\nChecking API server for static file serving...")
    with sftp.file(f"{VPS_WALLET_DIR}/api_server.py", "r") as f:
        api_content = f.read().decode()

    if "SERVE REACT FRONTEND" not in api_content:
        print("  Adding static file serving to api_server.py...")
        with sftp.file(f"{VPS_WALLET_DIR}/api_server.py", "a") as f:
            f.write(STATIC_SERVE_CODE)
        print("  Static serving code added!")
    else:
        print("  Static serving already configured.")

    sftp.close()

    # Restart the API server
    print("\nRestarting API server...")
    ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
    time.sleep(2)
    stdin, stdout, stderr = ssh.exec_command(
        "systemctl restart incentives-wallet 2>&1", timeout=10
    )
    time.sleep(5)

    # Check health
    print("\nChecking server health...")
    stdin, stdout, stderr = ssh.exec_command(
        "curl -s http://localhost:8546/v1/health 2>&1", timeout=10
    )
    health = stdout.read().decode().strip()
    print(f"  Health: {health[:200]}")

    # Check if index.html is served
    print("\nChecking if frontend is served...")
    stdin, stdout, stderr = ssh.exec_command(
        "curl -s http://localhost:8546/ 2>&1 | head -5", timeout=10
    )
    index_resp = stdout.read().decode().strip()
    if "<!DOCTYPE html>" in index_resp or "<html" in index_resp:
        print("  Frontend is being served!")
    else:
        print(f"  Frontend check response: {index_resp[:200]}")

    ssh.close()
    print("\nDeployment complete!")
    print(f"  App URL: http://{VPS_HOST}:8546/")


if __name__ == "__main__":
    build_react()
    deploy_to_vps()

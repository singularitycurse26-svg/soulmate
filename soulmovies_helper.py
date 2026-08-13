"""
SoulMovies Generation Helper
Handles submitting large movie scripts to the SoulMovies API on the VPS.
Uses SFTP file upload + curl -d @file to avoid command-line length/escaping issues.
"""
import paramiko
import time
import json
import sys

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"
API_BASE = "http://localhost:8546"


def submit_movie(script: str, style: str = "cinematic", duration_s: int = 35,
                 resolution: str = "1080p") -> dict:
    """Submit a movie script to SoulMovies API. Returns {project_id, status, progress}."""
    payload = json.dumps({
        "text_description": script,
        "style": style,
        "duration_s": duration_s,
        "resolution": resolution,
    })

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Upload payload as file to avoid shell escaping issues
    sftp = c.open_sftp()
    with sftp.open("/tmp/_soulmovie_payload.json", "w") as f:
        f.write(payload)
    sftp.close()

    # Submit via curl with file
    _, stdout, stderr = c.exec_command(
        f"curl -s -X POST {API_BASE}/v1/soulmovies/create "
        "-H 'Content-Type: application/json' "
        "-d @/tmp/_soulmovie_payload.json"
    )
    resp = stdout.read().decode()
    c.close()

    return json.loads(resp)


def check_status(project_id: str) -> dict:
    """Check the status of a movie generation project."""
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=15)

    _, stdout, _ = c.exec_command(f"curl -s {API_BASE}/v1/soulmovies/status/{project_id}")
    resp = stdout.read().decode()
    c.close()

    return json.loads(resp)


def wait_for_completion(project_id: str, poll_interval: int = 60,
                        max_wait: int = 10800, on_progress=None) -> dict:
    """Wait for movie generation to complete. Returns final status dict."""
    last_progress = -1
    last_status = ""

    for i in range(max_wait // poll_interval):
        time.sleep(poll_interval)
        sdata = check_status(project_id)

        progress = sdata.get("progress", 0)
        status = sdata.get("status", "unknown")

        if progress != last_progress or status != last_status:
            elapsed = i * poll_interval
            mins = elapsed // 60
            secs = elapsed % 60
            msg = f"[{mins}m{secs}s] status={status} progress={progress:.2f}"
            print(msg)
            if on_progress:
                on_progress(sdata)
            last_progress = progress
            last_status = status

        if status in ("complete", "failed"):
            return sdata

    return check_status(project_id)


def get_download_url(project_id: str) -> str:
    """Get the external download URL for a completed movie."""
    return f"https://191.44.121.29.sslip.io/v1/soulmovies/download/{project_id}"


def generate_movie(script: str, style: str = "cinematic", duration_s: int = 35,
                   resolution: str = "1080p", wait: bool = True,
                   poll_interval: int = 60) -> dict:
    """
    Submit a movie script and optionally wait for completion.
    Returns final status dict if wait=True, or initial submission dict if wait=False.
    """
    print(f"Script: {len(script)} chars, ~{len(script.split())} words")
    print(f"Duration: {duration_s}s ({duration_s // 60}m{duration_s % 60}s)")

    result = submit_movie(script, style, duration_s, resolution)
    pid = result.get("project_id")

    if not pid:
        print(f"Error: {result}")
        return result

    print(f"Project ID: {pid}")

    scenes = max(1, duration_s // 10)
    if duration_s % 10 > 0:
        scenes += 1
    est_minutes = (scenes * 35) // 60
    print(f"Estimated scenes: {scenes}")
    print(f"Estimated generation time: ~{est_minutes} minutes")
    print(f"Download URL: {get_download_url(pid)}")
    print()

    if not wait:
        return result

    final = wait_for_completion(pid, poll_interval=poll_interval)

    print(f"\n=== FINAL ===")
    print(f"Status: {final['status']}")
    print(f"Progress: {final['progress']}")
    print(f"Output: {final.get('output_path', 'none')}")
    print(f"Download: {get_download_url(pid)}")

    return final


if __name__ == "__main__":
    # Example: generate a short test movie
    test_script = (
        "A cinematic journey through a futuristic city at night, "
        "neon lights reflecting off rain-soaked streets, "
        "a lone figure walking through the glow."
    )
    result = generate_movie(test_script, duration_s=15, wait=True, poll_interval=10)
    print(f"\nDone! Status: {result['status']}")

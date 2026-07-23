import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Find the static file serving section
lines = content.split('\n')
static_line = None
for i, line in enumerate(lines):
    if 'Static' in line or 'app.mount' in line or 'StaticFiles' in line or 'catch_all' in line or 'SPA' in line:
        static_line = i
        print(f"Found static section at line {i+1}: {line.strip()}")
        break

if static_line is None:
    # Try to find the SPA fallback route
    for i, line in enumerate(lines):
        if '@app.get' in line and 'path' in line and ('{' in line or 'catch' in line.lower()):
            static_line = i
            print(f"Found catch-all route at line {i+1}: {line.strip()}")
            break

# Find where the game endpoints were appended (search for GAME_ROOMS marker)
game_start = None
for i, line in enumerate(lines):
    if 'GAME ROOMS' in line and '====' in line:
        game_start = i
        print(f"Found game endpoints at line {i+1}")
        break

if game_start is not None:
    # Extract the game endpoints block
    game_block = '\n'.join(lines[game_start:])
    # Remove from end
    lines = lines[:game_start]
    content = '\n'.join(lines)
    
    if static_line is not None and static_line < game_start:
        # Insert before the static section
        insert_line = static_line
        lines = content.split('\n')
        new_lines = lines[:insert_line] + game_block.split('\n') + [''] + lines[insert_line:]
        content = '\n'.join(new_lines)
        print(f"Moved game endpoints before line {insert_line+1}")
    else:
        # Just re-add at the right position - find the static marker again
        for i, line in enumerate(lines):
            if 'Static' in line or 'app.mount' in line or 'StaticFiles' in line:
                new_lines = lines[:i] + game_block.split('\n') + [''] + lines[i:]
                content = '\n'.join(new_lines)
                print(f"Inserted game endpoints before line {i+1}")
                break
        else:
            # Fallback: add before the last @app route
            content = content + '\n' + game_block
            print("Could not find static section, appended at end")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
print(f"Health: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/games/rooms/list 2>&1", timeout=10)
result = stdout.read().decode().strip()
print(f"Rooms endpoint: {result[:200]}")

if '"rooms"' in result:
    print("\nSUCCESS: Game rooms endpoint working!")
else:
    print("\nWARNING: Rooms endpoint not returning expected response")
    # Check for errors
    stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 20 2>&1", timeout=10)
    print(f"Recent logs:\n{stdout.read().decode()[:500]}")

ssh.close()
print("\nDone!")

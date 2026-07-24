import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=30)

# Fix CORS allow_headers
sed_cmd = """sed -i 's/allow_headers=\\["X-API-Token", "Content-Type"\\]/allow_headers=["X-API-Token", "X-Session-Token", "Content-Type"]/' /opt/incentives-wallet/api_server.py"""
stdin, stdout, stderr = c.exec_command(sed_cmd, timeout=15)
print("SED:", stdout.read().decode(), stderr.read().decode())

# Verify
stdin, stdout, stderr = c.exec_command('grep -n "allow_headers" /opt/incentives-wallet/api_server.py', timeout=15)
print("VERIFY:", stdout.read().decode())

# Compile check
stdin, stdout, stderr = c.exec_command(
    'python3 -c "import py_compile; py_compile.compile(\'/opt/incentives-wallet/api_server.py\', doraise=True)" 2>&1',
    timeout=15
)
compile_out = stdout.read().decode()
print("COMPILE:", compile_out if compile_out else "OK")

if not compile_out:
    # Restart
    stdin, stdout, stderr = c.exec_command('systemctl restart incentives-wallet.service', timeout=30)
    print("RESTART:", stdout.read().decode(), stderr.read().decode())
    time.sleep(5)

    # Test health
    stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/health 2>&1 | head -c 100', timeout=15)
    print("HEALTH:", stdout.read().decode())

    # Test CORS preflight
    stdin, stdout, stderr = c.exec_command(
        'curl -s -X OPTIONS -H "Origin: https://soulmate-hermes-agent.netlify.app" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: X-Session-Token" -D - http://localhost:8546/v1/email/inbox 2>&1 | head -20',
        timeout=15
    )
    print("CORS:", stdout.read().decode())

c.close()

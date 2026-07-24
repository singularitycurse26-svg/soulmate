#!/usr/bin/env python3
"""Test translation endpoint on VPS."""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=30)

cmd = """curl -s -X POST http://127.0.0.1:8546/v1/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello, how are you?","target_lang":"es","source_lang":"en"}'"""

_, o, e = c.exec_command(cmd, timeout=30)
print("Translate result:", o.read().decode()[:500])

# Test user language endpoint
cmd2 = """curl -s -X POST http://127.0.0.1:8546/v1/user/language \
  -H 'Content-Type: application/json' \
  -H 'X-Session-Token: user_1_test' \
  -d '{"language":"es"}'"""

_, o2, e2 = c.exec_command(cmd2, timeout=15)
print("Set language:", o2.read().decode()[:200])

cmd3 = """curl -s http://127.0.0.1:8546/v1/user/language \
  -H 'X-Session-Token: user_1_test'"""

_, o3, e3 = c.exec_command(cmd3, timeout=15)
print("Get language:", o3.read().decode()[:200])

c.close()

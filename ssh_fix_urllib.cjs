const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Add import urllib.request at the top of hermes_llm_proxy function
  // The function starts with "async def hermes_llm_proxy"
  // We need to add "import urllib.request" right after the try/data parsing
  console.log("Fixing urllib import...");
  
  // Replace the first occurrence of "provider = data.get("provider", "backend")" in hermes_llm_proxy 
  // with "import urllib.request\n    provider = data.get("provider", "backend")"
  const fix = await exec(`python3 -c "
import re
with open('/opt/incentives-wallet/api_server.py', 'r') as f:
    content = f.read()

# Find hermes_llm_proxy and add import at top of function
old = '''async def hermes_llm_proxy(request: Request):
    try:
        data = await request.json()
    except:
        raise HTTPException(status_code=400, detail=\"Invalid JSON\")
    provider = data.get(\"provider\", \"backend\")'''

new = '''async def hermes_llm_proxy(request: Request):
    import urllib.request
    try:
        data = await request.json()
    except:
        raise HTTPException(status_code=400, detail=\"Invalid JSON\")
    provider = data.get(\"provider\", \"backend\")'''

if old in content:
    content = content.replace(old, new, 1)
    with open('/opt/incentives-wallet/api_server.py', 'w') as f:
        f.write(content)
    print('FIXED')
else:
    print('PATTERN_NOT_FOUND')
" 2>&1`);
  console.log("Fix result:", fix.trim());

  // Restart
  console.log("Restarting...");
  await exec("systemctl restart incentives-wallet 2>&1");
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(5000);
  
  const status = await exec("systemctl is-active incentives-wallet 2>&1");
  console.log("Service:", status.trim());

  if (status.trim() === "active") {
    console.log("\nVerifying Hermes LLM...");
    const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi in 3 words"}]}\' 2>&1');
    console.log("Hermes LLM:", llm.trim().slice(0, 500));
    
    console.log("\nVerifying OpenClaw terminal...");
    const oterm = await exec('curl -s -X POST http://localhost:8546/v1/openclaw/terminal -H "Content-Type: application/json" -d \'{"command":"whoami"}\' 2>&1');
    console.log("OpenClaw Terminal:", oterm.trim());
    
    console.log("\nVerifying Hermes terminal...");
    const term = await exec('curl -s -X POST http://localhost:8546/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"hostname"}\' 2>&1');
    console.log("Hermes Terminal:", term.trim());
    
    console.log("\nVerifying Hermes cron...");
    const cron = await exec("curl -s http://localhost:8546/v1/hermes/cron 2>&1");
    console.log("Hermes Cron:", cron.trim());
    
    console.log("\nVerifying Hermes sessions...");
    const sess = await exec("curl -s http://localhost:8546/v1/hermes/sessions 2>&1");
    console.log("Hermes Sessions:", sess.trim());
    
    console.log("\nVerifying Hermes subagents...");
    const sub = await exec("curl -s http://localhost:8546/v1/hermes/subagent 2>&1");
    console.log("Hermes Subagents:", sub.trim());
  }

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

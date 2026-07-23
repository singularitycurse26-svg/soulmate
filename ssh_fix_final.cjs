const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Use sed to add "import urllib.request" after the function def line
  console.log("Fixing with sed...");
  const fix = await exec("sed -i '/async def hermes_llm_proxy(request: Request):/a\\    import urllib.request' /opt/incentives-wallet/api_server.py 2>&1");
  console.log("sed:", fix.trim() || "done");

  // Verify the line was added
  const check = await exec("grep -n 'import urllib.request' /opt/incentives-wallet/api_server.py | head -5 2>&1");
  console.log("Imports:", check.trim());

  // Restart
  console.log("Restarting...");
  await exec("systemctl restart incentives-wallet 2>&1");
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(5000);
  
  const status = await exec("systemctl is-active incentives-wallet 2>&1");
  console.log("Service:", status.trim());

  if (status.trim() === "active") {
    console.log("\nHermes LLM test...");
    const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi in 3 words"}]}\' 2>&1');
    console.log("Hermes LLM:", llm.trim().slice(0, 500));
  }

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Check what model the existing AI chat endpoint uses
  console.log("Checking existing AI chat endpoint...");
  const r1 = await exec("grep -n 'gemini\\|GEMINI\\|generativelanguage' /opt/incentives-wallet/api_server.py | head -10 2>&1");
  console.log(r1.trim());

  // Try the existing openclaw-llm to see if it works
  console.log("\nTesting existing openclaw-llm...");
  const r2 = await exec('curl -s -X POST http://localhost:8546/v1/ai/openclaw-llm -H "Content-Type: application/json" -d \'{"provider":"google","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi"}],"api_key":"REDACTED_GCP_KEY"}\' 2>&1');
  console.log("OpenClaw LLM:", r2.trim().slice(0, 400));

  // Try hermes-llm with the same key
  console.log("\nTesting hermes-llm with google provider...");
  const r3 = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"google","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi"}],"api_key":"REDACTED_GCP_KEY"}\' 2>&1');
  console.log("Hermes LLM (google):", r3.trim().slice(0, 400));

  // Try hermes-llm with backend and check what GEMINI_API_KEY env is
  console.log("\nChecking GEMINI_API_KEY env...");
  const r4 = await exec("systemctl show incentives-wallet --property=Environment 2>&1");
  console.log(r4.trim());

  // Try with the env key directly
  console.log("\nTesting hermes-llm backend with explicit key...");
  const r5 = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi"}],"api_key":"REDACTED_GCP_KEY"}\' 2>&1');
  console.log("Hermes LLM (backend+key):", r5.trim().slice(0, 400));

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

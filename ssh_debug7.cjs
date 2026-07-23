const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Get the existing call_gemini function
  console.log("Existing call_gemini function...");
  const r1 = await exec("sed -n '1789,1830p' /opt/incentives-wallet/api_server.py 2>&1");
  console.log(r1.trim());

  // Test with gemini-flash-latest
  console.log("\nTesting with gemini-flash-latest...");
  const r2 = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-flash-latest","messages":[{"role":"user","content":"say hi in 3 words"}]}\' 2>&1');
  console.log("Result:", r2.trim().slice(0, 500));

  // Also test the existing /v1/ai/chat endpoint
  console.log("\nTesting existing /v1/ai/chat...");
  const r3 = await exec('curl -s -X POST http://localhost:8546/v1/ai/chat -H "Content-Type: application/json" -d \'{"message":"say hi in 3 words"}\' 2>&1');
  console.log("AI chat:", r3.trim().slice(0, 500));

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

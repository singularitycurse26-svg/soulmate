const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  console.log("Recent error logs...");
  const logs = await exec("tail -30 /var/log/wallet-api.log 2>&1");
  console.log(logs.trim());

  console.log("\nTesting LLM with verbose...");
  const llm = await exec('curl -sv -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi"}]}\' 2>&1 | tail -20');
  console.log(llm.trim());

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(5000);
  
  console.log("Service status...");
  const status = await exec("systemctl is-active incentives-wallet 2>&1");
  console.log(status.trim());
  
  console.log("\nError log (last 20 lines)...");
  const logs = await exec("tail -20 /var/log/wallet-api.log 2>&1");
  console.log(logs.trim());
  
  console.log("\nVerifying endpoints...");
  const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi"}]}\' 2>&1');
  console.log("Hermes LLM:", llm.trim().slice(0, 400));
  
  const term = await exec('curl -s -X POST http://localhost:8546/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\' 2>&1');
  console.log("Hermes Terminal:", term.trim());
  
  const cron = await exec("curl -s http://localhost:8546/v1/hermes/cron 2>&1");
  console.log("Hermes Cron:", cron.trim());
  
  const sess = await exec("curl -s http://localhost:8546/v1/hermes/sessions 2>&1");
  console.log("Hermes Sessions:", sess.trim());
  
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

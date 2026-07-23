const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Fix the syntax error - double }} should be single }
  console.log("Fixing syntax error...");
  const fix = await exec(`sed -i 's/system_text\\}]}}/system_text}]}/' /opt/incentives-wallet/api_server.py 2>&1`);
  console.log("sed result:", fix.trim());

  // Also check for the same pattern in the backend provider section
  const fix2 = await exec(`grep -n 'system_text}]}}' /opt/incentives-wallet/api_server.py 2>&1`);
  console.log("Remaining double }}:", fix2.trim() || "none");

  // Check the specific line
  const line = await exec("sed -n '3788p' /opt/incentives-wallet/api_server.py 2>&1");
  console.log("Line 3788:", line.trim());

  // Restart
  console.log("Restarting...");
  const restart = await exec("systemctl restart incentives-wallet 2>&1");
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(5000);
  
  const status = await exec("systemctl is-active incentives-wallet 2>&1");
  console.log("Service:", status.trim());

  const logs = await exec("tail -5 /var/log/wallet-api.log 2>&1");
  console.log("Logs:", logs.trim());

  if (status.trim() === "active") {
    console.log("\nVerifying endpoints...");
    const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi"}]}\' 2>&1');
    console.log("Hermes LLM:", llm.trim().slice(0, 400));

    const term = await exec('curl -s -X POST http://localhost:8546/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\' 2>&1');
    console.log("Hermes Terminal:", term.trim());

    const cron = await exec("curl -s http://localhost:8546/v1/hermes/cron 2>&1");
    console.log("Hermes Cron:", cron.trim());

    const sess = await exec("curl -s http://localhost:8546/v1/hermes/sessions 2>&1");
    console.log("Hermes Sessions:", sess.trim());
  }

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

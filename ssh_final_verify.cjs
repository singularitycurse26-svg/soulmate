const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Fix default model in backend provider: gemini-1.5-flash -> gemini-flash-latest
  console.log("Fixing default model names...");
  const fix = await exec("sed -i 's/gemini-1.5-flash/gemini-flash-latest/g' /opt/incentives-wallet/api_server.py 2>&1");
  console.log("sed:", fix.trim() || "done");

  // Restart
  await exec("systemctl restart incentives-wallet 2>&1");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(5000);

  const status = await exec("systemctl is-active incentives-wallet 2>&1");
  console.log("Service:", status.trim());

  if (status.trim() === "active") {
    console.log("\nFinal verification of all endpoints:");
    
    const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-flash-latest","messages":[{"role":"user","content":"say hi in 3 words"}]}\' 2>&1');
    console.log("Hermes LLM:", llm.trim().slice(0, 300));

    const term = await exec('curl -s -X POST http://localhost:8546/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\' 2>&1');
    console.log("Hermes Terminal:", term.trim());

    const oterm = await exec('curl -s -X POST http://localhost:8546/v1/openclaw/terminal -H "Content-Type: application/json" -d \'{"command":"whoami"}\' 2>&1');
    console.log("OpenClaw Terminal:", oterm.trim());

    const cron = await exec("curl -s http://localhost:8546/v1/hermes/cron 2>&1");
    console.log("Hermes Cron:", cron.trim());

    const sess = await exec("curl -s http://localhost:8546/v1/hermes/sessions 2>&1");
    console.log("Hermes Sessions:", sess.trim());

    const sub = await exec("curl -s http://localhost:8546/v1/hermes/subagent 2>&1");
    console.log("Hermes Subagents:", sub.trim());
  }

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

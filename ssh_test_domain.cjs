const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  console.log("Caddy status...");
  const r1 = await exec("systemctl is-active caddy 2>&1");
  console.log(r1.trim());

  console.log("\nCaddy logs (last 20)...");
  const r2 = await exec("journalctl -u caddy --no-pager -n 20 2>&1");
  console.log(r2.trim());

  console.log("\nTesting HTTPS via domain...");
  const r3 = await exec("curl -sv https://191.44.121.29.sslip.io/v1/ai/hermes-llm -X POST -H 'Content-Type: application/json' -d '{\"provider\":\"backend\",\"model\":\"gemini-flash-latest\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}' 2>&1 | tail -30");
  console.log(r3.trim());

  console.log("\nTesting HTTP (port 80)...");
  const r4 = await exec("curl -sv http://191.44.121.29.sslip.io/v1/hermes/cron 2>&1 | tail -15");
  console.log(r4.trim());

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

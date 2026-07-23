const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  console.log("Caddy config...");
  const r1 = await exec("cat /etc/caddy/Caddyfile 2>&1");
  console.log(r1.trim());

  console.log("\nChecking if HTTPS proxy works...");
  const r2 = await exec("curl -sk https://localhost/health 2>&1 | head -c 200");
  console.log(r2.trim());

  console.log("\nChecking external HTTPS...");
  const r3 = await exec("curl -s https://191.44.121.29/health -k 2>&1 | head -c 200");
  console.log(r3.trim());

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

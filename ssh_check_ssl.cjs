const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  // Check if nginx/ssl is set up
  console.log("Checking nginx...");
  const r1 = await exec("nginx -t 2>&1 || echo 'no nginx'");
  console.log(r1.trim());

  console.log("\nChecking SSL certs...");
  const r2 = await exec("ls /etc/ssl/certs/*.pem 2>/dev/null; ls /etc/letsencrypt/live/ 2>/dev/null; echo '---'");
  console.log(r2.trim());

  console.log("\nChecking what's listening...");
  const r3 = await exec("ss -tlnp | grep -E '443|80|8546' 2>&1");
  console.log(r3.trim());

  console.log("\nChecking nginx config...");
  const r4 = await exec("cat /etc/nginx/sites-enabled/default 2>/dev/null || cat /etc/nginx/nginx.conf 2>/dev/null | head -50");
  console.log(r4.trim());

  console.log("\nChecking domain...");
  const r5 = await exec("hostname; curl -s ifconfig.me 2>&1");
  console.log(r5.trim());

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

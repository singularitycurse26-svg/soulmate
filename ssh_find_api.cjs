const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  console.log('Finding api_server.py...');
  const r1 = await exec("find / -name api_server.py -not -path '*/node_modules/*' 2>/dev/null | head -5");
  console.log(r1.trim());
  console.log('Checking service...');
  const r2 = await exec("systemctl cat incentives-wallet 2>/dev/null | head -20");
  console.log(r2.trim());
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

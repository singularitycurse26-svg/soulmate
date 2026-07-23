const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  
  console.log('Checking error log...');
  const logs = await exec("tail -50 /var/log/wallet-api.log 2>&1");
  console.log(logs.trim());
  
  console.log('\nChecking if process is running...');
  const ps = await exec("ps aux | grep api_server 2>&1");
  console.log(ps.trim());
  
  console.log('\nChecking what port it should be on...');
  const port = await exec("grep -i port /opt/incentives-wallet/api_server.py | head -5 2>&1");
  console.log(port.trim());
  
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

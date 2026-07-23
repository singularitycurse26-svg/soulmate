const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  
  // Get the openclaw_llm function body
  console.log('OpenClaw LLM proxy function...');
  const r1 = await exec("sed -n '3534,3690p' /opt/incentives-wallet/api_server.py 2>&1");
  console.log(r1.trim());
  
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

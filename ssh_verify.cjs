const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  
  console.log('Checking service logs...');
  const logs = await exec("journalctl -u incentives-wallet --no-pager -n 20 2>&1");
  console.log(logs.trim());
  
  console.log('\nChecking if port 8000 is listening...');
  const port = await exec("ss -tlnp | grep 8000 2>&1");
  console.log(port.trim() || 'Port 8000 not found');
  
  console.log('\nTrying curl to health...');
  const health = await exec("curl -sv http://localhost:8000/health 2>&1 | tail -20");
  console.log(health.trim());
  
  console.log('\nTrying hermes-llm...');
  const llm = await exec('curl -s -X POST http://localhost:8000/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini","messages":[{"role":"user","content":"say hi"}]}\' 2>&1');
  console.log(llm.trim().slice(0, 500));
  
  console.log('\nTrying hermes terminal...');
  const term = await exec('curl -s -X POST http://localhost:8000/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\' 2>&1');
  console.log(term.trim().slice(0, 500));
  
  console.log('\nTrying openclaw terminal...');
  const oterm = await exec('curl -s -X POST http://localhost:8000/v1/openclaw/terminal -H "Content-Type: application/json" -d \'{"command":"whoami"}\' 2>&1');
  console.log(oterm.trim().slice(0, 500));
  
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

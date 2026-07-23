const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  
  console.log('Health check on port 8546...');
  const health = await exec("curl -s http://localhost:8546/health 2>&1");
  console.log(health.trim().slice(0, 300));
  
  console.log('\nHermes LLM endpoint...');
  const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini","messages":[{"role":"user","content":"say hi"}]}\' 2>&1');
  console.log(llm.trim().slice(0, 500));
  
  console.log('\nHermes terminal endpoint...');
  const term = await exec('curl -s -X POST http://localhost:8546/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\' 2>&1');
  console.log(term.trim().slice(0, 500));
  
  console.log('\nOpenClaw terminal endpoint...');
  const oterm = await exec('curl -s -X POST http://localhost:8546/v1/openclaw/terminal -H "Content-Type: application/json" -d \'{"command":"whoami"}\' 2>&1');
  console.log(oterm.trim().slice(0, 500));
  
  console.log('\nHermes cron list...');
  const cron = await exec("curl -s http://localhost:8546/v1/hermes/cron 2>&1");
  console.log(cron.trim().slice(0, 300));
  
  console.log('\nHermes sessions list...');
  const sess = await exec("curl -s http://localhost:8546/v1/hermes/sessions 2>&1");
  console.log(sess.trim().slice(0, 300));
  
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

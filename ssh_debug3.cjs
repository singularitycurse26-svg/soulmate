const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });
  
  // Check what the openclaw-llm endpoint looks like
  console.log('Checking openclaw-llm endpoint definition...');
  const r1 = await exec("grep -n 'openclaw.llm\\|openclaw-llm\\|def.*openclaw' /opt/incentives-wallet/api_server.py | head -10 2>&1");
  console.log(r1.trim());
  
  // Check what LLM helper functions exist
  console.log('\nChecking LLM helper functions...');
  const r2 = await exec("grep -n 'def.*call.*llm\\|def.*_llm\\|async def.*call' /opt/incentives-wallet/api_server.py | head -20 2>&1");
  console.log(r2.trim());
  
  // Check if hermes endpoints were inserted
  console.log('\nChecking hermes endpoints in file...');
  const r3 = await exec("grep -n 'hermes' /opt/incentives-wallet/api_server.py | head -20 2>&1");
  console.log(r3.trim());
  
  // Check if __name__ block exists
  console.log('\nChecking __name__ block...');
  const r4 = await exec("grep -n '__name__' /opt/incentives-wallet/api_server.py 2>&1");
  console.log(r4.trim());
  
  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });

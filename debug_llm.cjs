const { Client } = require("ssh2");
const c = new Client();
c.on("ready", () => {
  c.exec("grep -n '_call_backend_llm\\|def _call_backend\\|GEMINI_API_KEY\\|gemini' /opt/incentives-wallet/api_server.py | head -30 2>&1; echo '===BREAK==='; grep -n 'def _call_' /opt/incentives-wallet/api_server.py | head -20 2>&1; echo '===BREAK==='; systemctl show incentives-wallet --property=Environment 2>&1; echo '===BREAK==='; grep -n 'GEMINI\\|GOOGLE_API\\|gemini-1.5' /opt/incentives-wallet/api_server.py | head -10 2>&1", (err, stream) => {
    if (err) { console.error("exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => { console.log(out); c.end(); });
  });
});
c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

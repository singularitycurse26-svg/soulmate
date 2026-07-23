const { Client } = require("ssh2");
const c = new Client();
c.on("ready", () => {
  c.exec("grep -n 'email/setup\\|email/account\\|email/inbox\\|email/send\\|def.*email' /opt/incentives-wallet/api_server.py | head -20 2>&1; echo '===BREAK==='; curl -s -X POST http://localhost:8546/v1/email/setup -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' 2>&1; echo; echo '===BREAK==='; curl -s http://localhost:8546/v1/email/account -H 'X-API-Token: soulmate_wallet_2024' 2>&1; echo; echo '===BREAK==='; curl -s http://localhost:8546/v1/email/inbox -H 'X-API-Token: soulmate_wallet_2024' 2>&1", (err, stream) => {
    if (err) { console.error("exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => { console.log(out); c.end(); });
  });
});
c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

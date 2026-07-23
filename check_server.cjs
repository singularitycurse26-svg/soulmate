const { Client } = require("ssh2");
const c = new Client();
c.on("ready", () => {
  c.exec("systemctl status incentives-wallet 2>&1; echo '===BREAK==='; curl -s http://localhost:8546/v1/health 2>&1; echo; echo '===BREAK==='; curl -s http://localhost:8546/v1/social/feed 2>&1; echo; echo '===BREAK==='; curl -s http://localhost:8546/v1/marketplace/listings 2>&1; echo; echo '===BREAK==='; journalctl -u incentives-wallet --no-pager -n 30 2>&1", (err, stream) => {
    if (err) { console.error("exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => {
      console.log(out);
      c.end();
    });
  });
});
c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

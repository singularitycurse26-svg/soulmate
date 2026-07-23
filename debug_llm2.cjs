const { Client } = require("ssh2");
const c = new Client();
c.on("ready", () => {
  c.exec("grep -n 'def _call_backend_llm' /opt/incentives-wallet/api_server.py 2>&1; echo '===BREAK==='; sed -n '4440,4480p' /opt/incentives-wallet/api_server.py 2>&1; echo '===BREAK==='; sed -n '4310,4340p' /opt/incentives-wallet/api_server.py 2>&1; echo '===BREAK==='; curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H 'Content-Type: application/json' -d '{\"provider\":\"google\",\"model\":\"gemini-flash-latest\",\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}],\"api_key\":\"REDACTED_GCP_KEY\"}' 2>&1", (err, stream) => {
    if (err) { console.error("exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => { console.log(out); c.end(); });
  });
});
c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

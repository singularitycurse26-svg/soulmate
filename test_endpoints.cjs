const { Client } = require("ssh2");
const c = new Client();
c.on("ready", () => {
  // Test hermes-llm endpoint from the server itself
  c.exec("curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{\"provider\":\"backend\",\"model\":\"gemini\",\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}]}' 2>&1; echo; echo '===BREAK==='; curl -s -X POST http://localhost:8546/v1/ai/openclaw-llm -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{\"provider\":\"backend\",\"model\":\"gemini\",\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}]}' 2>&1; echo; echo '===BREAK==='; curl -s -X POST http://localhost:8546/v1/hermes/terminal -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{\"command\":\"echo hello\"}' 2>&1; echo; echo '===BREAK==='; curl -s -X POST http://localhost:8546/v1/openclaw/terminal -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{\"command\":\"echo hello\"}' 2>&1", (err, stream) => {
    if (err) { console.error("exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => { console.log(out); c.end(); });
  });
});
c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

const { Client } = require("ssh2");
const c = new Client();
c.on("ready", () => {
  c.exec("curl -s -X POST http://localhost:8546/v1/ai/openclaw-llm -H 'Content-Type: application/json' -d '{\"provider\":\"backend\",\"model\":\"gemini-flash-latest\",\"messages\":[{\"role\":\"user\",\"content\":\"say hello\"}]}' 2>&1", (err, stream) => {
    if (err) { console.error("exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => { console.log("Result:", out); c.end(); });
  });
});
c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

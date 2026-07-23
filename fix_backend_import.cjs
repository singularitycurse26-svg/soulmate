const { Client } = require("ssh2");
const c = new Client();

const REMOTE_FILE = "/opt/incentives-wallet/api_server.py";

c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) { console.error("SFTP error:", err); c.end(); return; }

    const readStream = sftp.createReadStream(REMOTE_FILE);
    let content = "";
    readStream.on("data", (chunk) => { content += chunk.toString(); });
    readStream.on("end", () => {
      try {
        // The backend case is missing "import urllib.request" and "import os"
        // Fix: add import urllib.request before the urllib.request.Request call in the backend case
        const oldCode = `    elif provider == "backend":
        # Use Gemini API key from environment
        import os
        gemini_key = os.environ.get("GEMINI_API_KEY", "")`;

        const newCode = `    elif provider == "backend":
        # Use Gemini API key from environment
        import os
        import urllib.request
        gemini_key = os.environ.get("GEMINI_API_KEY", "")`;

        if (content.includes(newCode)) {
          console.log("Already fixed, testing...");
          testEndpoint();
          return;
        }

        if (!content.includes(oldCode)) {
          console.error("Could not find backend provider case!");
          c.end();
          return;
        }

        content = content.replace(oldCode, newCode);

        console.log("Writing fixed api_server.py...");
        const writeStream = sftp.createWriteStream(REMOTE_FILE);
        writeStream.write(content, "utf8");
        writeStream.on("close", () => {
          console.log("Fixed backend provider with urllib import");
          testEndpoint();
        });
        writeStream.on("error", (e) => { console.error("Write error:", e); c.end(); });
        writeStream.end();
      } catch (e) {
        console.error("Patch error:", e.message);
        c.end();
      }
    });
    readStream.on("error", (e) => { console.error("Read error:", e); c.end(); });
  });
});

function testEndpoint() {
  console.log("Restarting and testing...");
  c.exec("pkill -f api_server 2>/dev/null; sleep 2; systemctl restart incentives-wallet 2>&1; sleep 5; curl -s -X POST http://localhost:8546/v1/ai/openclaw-llm -H 'Content-Type: application/json' -d '{\"provider\":\"backend\",\"model\":\"gemini-flash-latest\",\"messages\":[{\"role\":\"user\",\"content\":\"say hello\"}]}' 2>&1", (err, stream) => {
    if (err) { console.error("Exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => { console.log("Result:", out); c.end(); });
  });
}

c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

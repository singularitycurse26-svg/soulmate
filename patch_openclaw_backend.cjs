const { Client } = require("ssh2");
const c = new Client();

const REMOTE_FILE = "/opt/incentives-wallet/api_server.py";

c.on("ready", () => {
  console.log("SSH connected, reading api_server.py...");
  c.sftp((err, sftp) => {
    if (err) { console.error("SFTP error:", err); c.end(); return; }

    const readStream = sftp.createReadStream(REMOTE_FILE);
    let content = "";
    readStream.on("data", (chunk) => { content += chunk.toString(); });
    readStream.on("end", () => {
      try {
        // Find the OpenClaw LLM "else: return Unknown provider" and insert backend case before it
        const oldCode = `    else:
        return {"error": f"Unknown provider: {provider}"}



import subprocess as _subprocess
import json as _json
import uuid as _uuid

@app.post("/v1/ai/hermes-llm")`;

        const newCode = `    elif provider == "backend":
        # Use Gemini API key from environment
        import os
        gemini_key = os.environ.get("GEMINI_API_KEY", "")
        if not gemini_key:
            return {"error": "No GEMINI_API_KEY set"}
        gemini_model = model or "gemini-flash-latest"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
        contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
        system_text = chr(10).join([m["content"] for m in messages if m["role"] == "system"])
        body = {"contents": contents}
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": system_text}]}
        req = urllib.request.Request(url, data=_json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"response": text, "model": gemini_model}
        except Exception as e:
            return {"error": str(e)}
    else:
        return {"error": f"Unknown provider: {provider}"}



import subprocess as _subprocess
import json as _json
import uuid as _uuid

@app.post("/v1/ai/hermes-llm")`;

        if (content.includes("BACKEND_PROVIDER_PATCHED")) {
          console.log("Already patched with backend provider, skipping...");
          restartAndVerify();
          return;
        }

        if (!content.includes(oldCode)) {
          console.error("Could not find insertion point!");
          c.end();
          return;
        }

        content = content.replace(oldCode, newCode);
        // Add marker
        content = content.replace(
          'import subprocess as _subprocess\nimport json as _json\nimport uuid as _uuid\n\n@app.post("/v1/ai/hermes-llm")',
          '# BACKEND_PROVIDER_PATCHED\nimport subprocess as _subprocess\nimport json as _json\nimport uuid as _uuid\n\n@app.post("/v1/ai/hermes-llm")'
        );

        console.log("Writing patched api_server.py (" + content.length + " bytes)...");
        const writeStream = sftp.createWriteStream(REMOTE_FILE);
        writeStream.write(content, "utf8");
        writeStream.on("close", () => {
          console.log("Patched OpenClaw LLM with backend provider");
          restartAndVerify();
        });
        writeStream.on("error", (e) => { console.error("Write error:", e); conn.end(); });
        writeStream.end();
      } catch (e) {
        console.error("Patch error:", e.message);
        c.end();
      }
    });
    readStream.on("error", (e) => { console.error("Read error:", e); c.end(); });
  });
});

function restartAndVerify() {
  console.log("\nRestarting API server...");
  c.exec("pkill -f api_server 2>/dev/null; sleep 2; systemctl restart incentives-wallet 2>&1; sleep 5; curl -s -X POST http://localhost:8546/v1/ai/openclaw-llm -H 'Content-Type: application/json' -d '{\"provider\":\"backend\",\"model\":\"gemini-flash-latest\",\"messages\":[{\"role\":\"user\",\"content\":\"say hello\"}]}' 2>&1", (err, stream) => {
    if (err) { console.error("Exec error:", err); c.end(); return; }
    let out = "";
    stream.on("data", (d) => { out += d.toString(); });
    stream.stderr.on("data", (d) => { out += d.toString(); });
    stream.on("close", () => {
      console.log("OpenClaw backend provider test:", out);
      c.end();
    });
  });
}

c.on("error", (e) => console.error("SSH error:", e.message));
c.connect({ host: "191.44.121.29", username: "root", password: "wallmartxxxxxxxx8", readyTimeout: 15000 });

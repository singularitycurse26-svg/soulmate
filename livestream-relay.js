const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const path = require("path");

const FFMPEG_PATH = path.join(
  "C:",
  "Users",
  "hawpe",
  "CascadeProjects",
  "email-service",
  ".venv",
  "Lib",
  "site-packages",
  "imageio_ffmpeg",
  "binaries",
  "ffmpeg-win-x86_64-v7.1.exe"
);

const PORT = 8086;

const wss = new WebSocketServer({ port: PORT });

const streams = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const params = url.searchParams;

  const rtmpUrl = params.get("rtmp");
  const streamKey = params.get("key");
  const platform = params.get("platform") || "custom";

  if (!rtmpUrl || !streamKey) {
    ws.send(JSON.stringify({ type: "error", message: "Missing rtmp url or stream key" }));
    ws.close();
    return;
  }

  const fullRtmp = `${rtmpUrl}/${streamKey}`;
  console.log(`[${platform}] Starting stream to ${rtmpUrl}/***`);

  const ffmpegArgs = [
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-r", "30",
    "-g", "60",
    "-keyint_min", "30",
    "-b:v", "2500k",
    "-maxrate", "2500k",
    "-bufsize", "5000k",
    "-c:a", "aac",
    "-ar", "44100",
    "-b:a", "128k",
    "-f", "flv",
    fullRtmp,
  ];

  const ffmpeg = spawn(FFMPEG_PATH, ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });

  ffmpeg.stderr.on("data", (data) => {
    const line = data.toString();
    if (line.includes("frame=") || line.includes("ERROR")) {
      console.log(`[${platform}] ${line.trim()}`);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error(`[${platform}] FFmpeg error:`, err.message);
    try { ws.send(JSON.stringify({ type: "error", message: err.message })); } catch {}
  });

  ffmpeg.on("close", (code) => {
    console.log(`[${platform}] FFmpeg exited with code ${code}`);
    try { ws.send(JSON.stringify({ type: "ended", code })); } catch {}
    streams.delete(ws);
  });

  streams.set(ws, { ffmpeg, platform, rtmpUrl, startTime: Date.now() });

  ws.send(JSON.stringify({ type: "connected", platform, message: "Stream relay ready" }));

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      if (ffmpeg.stdin.writableEnded) return;
      ffmpeg.stdin.write(data);
    } else {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "end") {
          console.log(`[${platform}] Client ended stream`);
          ffmpeg.stdin.end();
        }
      } catch {}
    }
  });

  ws.on("close", () => {
    console.log(`[${platform}] WebSocket closed, stopping FFmpeg`);
    if (ffmpeg.stdin.writable) {
      ffmpeg.stdin.end();
    }
    streams.delete(ws);
  });

  ws.on("error", () => {
    try { ffmpeg.stdin.end(); } catch {}
    streams.delete(ws);
  });
});

console.log(`Wakkii Live Stream relay running on ws://127.0.0.1:${PORT}`);
console.log(`Connect with: ws://localhost:${PORT}?rtmp=rtmp://a.rtmp.youtube.com/live2&key=YOUR_KEY&platform=youtube`);

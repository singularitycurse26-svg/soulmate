#!/usr/bin/env node
/**
 * Soulmate OS Message Bouncer
 * 
 * Polls VPS for frontend errors, writes them to pending-fixes.json,
 * and injects an auto-fix message into Windsurf Cascade chat via
 * PowerShell UI automation.
 * 
 * Founder-only: only runs for the founder account.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "bouncer-config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

let lastAckIds = [];
let isProcessing = false;

async function pollVPS() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(`${config.vpsUrl}/v1/auto-heal/pending`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(`[${new Date().toISOString()}] Poll failed: ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const errors = data.errors || [];

    if (errors.length === 0) return;

    console.log(`[${new Date().toISOString()}] Found ${errors.length} new errors`);

    // Write pending-fixes.json
    const fixes = errors.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      stack: e.stack,
      page: e.page,
      timestamp: e.timestamp,
      severity: e.severity,
    }));

    fs.writeFileSync(config.pendingFixesPath, JSON.stringify(fixes, null, 2));

    // Format message for Cascade
    const errorList = errors
      .map((e, i) => `${i + 1}. [${e.type}] ${e.message}${e.page ? ` on ${e.page} page` : ""}`)
      .join("\n");

    const message = `Auto-fix: I detected ${errors.length} error(s) in Soulmate OS. Check pending-fixes.json in the project root and fix all of them automatically. Deploy the fixes when done.\n\nErrors:\n${errorList}`;

    // Inject into Windsurf
    injectMessage(message);

    // Acknowledge errors
    const ackIds = errors.map((e) => e.id);
    await ackErrors(ackIds);

    console.log(`[${new Date().toISOString()}] Injected ${errors.length} errors, acked`);
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error(`[${new Date().toISOString()}] Poll error:`, e.message);
    }
  } finally {
    isProcessing = false;
  }
}

function injectMessage(message) {
  const escaped = message.replace(/'/g, "''");
  const scriptPath = config.injectScript.replace(/\\/g, "\\\\");
  try {
    execSync(
      `powershell -ExecutionPolicy Bypass -File "${config.injectScript}" -Message '${escaped}'`,
      { timeout: 30000, stdio: "pipe" }
    );
    console.log("Message injected into Windsurf");
  } catch (e) {
    console.error("Injection failed:", e.message);
    // Fallback: just write the file, press Enter manually later
    console.log("Fallback: pending-fixes.json written, waiting for next Cascade interaction");
  }
}

async function ackErrors(ids) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(`${config.vpsUrl}/v1/auto-heal/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e) {
    console.error("Ack failed:", e.message);
  }
}

// Main loop
console.log(`[Bouncer] Started — polling ${config.vpsUrl} every ${config.pollIntervalMs / 1000}s`);
console.log(`[Bouncer] Workspace: ${config.workspacePath}`);
console.log(`[Bouncer] Founder-only mode: ${config.founderOnly}`);

setInterval(pollVPS, config.pollIntervalMs);

// Initial poll
pollVPS();

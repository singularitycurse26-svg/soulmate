// Aceline CLI — Tool execution (same protocol as cline_agent.py)
// RUN: <powershell command>     — execute a PowerShell command
// READ: <file path>              — read a file's contents
// WRITE: <file path>             — write content (next lines until ENDWRITE)
// SEARCH: <pattern>              — search for text in project files
// NAVIGATE: <page>               — (no-op in CLI, logged)
// DONE                          — task is complete

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, isAbsolute, dirname } from "path";
import { mkdirSync } from "fs";

export type Tool =
  | { type: "RUN"; command: string }
  | { type: "READ"; path: string }
  | { type: "WRITE"; path: string; content: string }
  | { type: "SEARCH"; pattern: string }
  | { type: "NAVIGATE"; page: string }
  | { type: "DONE" };

export function parseTools(response: string): Tool[] {
  const tools: Tool[] = [];
  const lines = response.split("\n");
  let inCode = false;
  let i = 0;

  while (i < lines.length) {
    const stripped = lines[i].trim();
    if (stripped.startsWith("```")) {
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) {
      i++;
      continue;
    }

    if (stripped.startsWith("RUN:")) {
      const cmd = stripped.slice(4).trim();
      if (cmd && cmd.length < 500) tools.push({ type: "RUN", command: cmd });
    } else if (stripped.startsWith("READ:")) {
      tools.push({ type: "READ", path: stripped.slice(5).trim() });
    } else if (stripped.startsWith("WRITE:")) {
      const path = stripped.slice(6).trim();
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "ENDWRITE") {
        contentLines.push(lines[i]);
        i++;
      }
      tools.push({ type: "WRITE", path, content: contentLines.join("\n") });
    } else if (stripped.startsWith("SEARCH:")) {
      tools.push({ type: "SEARCH", pattern: stripped.slice(7).trim() });
    } else if (stripped.startsWith("NAVIGATE:")) {
      tools.push({ type: "NAVIGATE", page: stripped.slice(9).trim() });
    } else if (stripped === "DONE") {
      tools.push({ type: "DONE" });
    }
    i++;
  }

  return tools;
}

export function executeTool(tool: Tool, cwd: string): string {
  switch (tool.type) {
    case "RUN":
      return executeCommand(tool.command, cwd);
    case "READ": {
      const path = isAbsolute(tool.path) ? tool.path : join(cwd, tool.path);
      if (!existsSync(path)) return `(file not found: ${path})`;
      try {
        const content = readFileSync(path, "utf-8");
        return content.slice(0, 3000);
      } catch (e: any) {
        return `(error reading ${path}: ${e.message})`;
      }
    }
    case "WRITE": {
      const path = isAbsolute(tool.path) ? tool.path : join(cwd, tool.path);
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, tool.content, "utf-8");
        return `(saved ${path})`;
      } catch (e: any) {
        return `(error writing ${path}: ${e.message})`;
      }
    }
    case "SEARCH":
      return executeCommand(
        `Select-String -Path "*.tsx","*.ts","*.py","*.js","*.json" -Pattern "${tool.pattern}" -Recurse | Select-Object -First 20`,
        cwd,
      );
    case "NAVIGATE":
      return `(navigate: ${tool.page} — no-op in CLI mode)`;
    case "DONE":
      return "DONE";
  }
}

function executeCommand(cmd: string, cwd: string): string {
  try {
    const output = execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, {
      cwd,
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 5,
    });
    return output.slice(0, 3000) || "(no output)";
  } catch (e: any) {
    if (e.killed) return "(timed out after 120s)";
    const out = (e.stdout || "") + (e.stderr || "");
    return out.slice(0, 3000) || `(error: ${e.message})`;
  }
}

import { useState, useRef, useEffect, useCallback } from "react";
import { incllmv2Api, hermesApi } from "@/lib/api";
import { useStore, type AppPage } from "@/lib/store";
import { getPageActions, getPageApiSummary, getAllRegisteredPages } from "@/lib/acelineRegistry";
import { useAcelineStore } from "@/lib/acelineStore";
import { cn } from "@/lib/utils";
import { Sparkles, Send, Loader2, Terminal, MapPin, Brain, Zap, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface CliMessage {
  role: "user" | "aceline" | "tool" | "system";
  text: string;
  timestamp: number;
  toolKind?: "RUN" | "READ" | "WRITE" | "SEARCH" | "NAVIGATE" | "DONE";
  toolResult?: string;
}

const GLM_MODEL = "glm-5.1";

const SOULMATE_PAGES: AppPage[] = [
  "dashboard", "business", "email", "phone", "contacts", "ai", "games",
  "wallet", "security", "openclaw", "hermes", "marketplace", "agent_market",
  "dating", "incentives", "daytrading", "frequency", "healing", "journal",
  "soultube", "soulillusions", "wakkii",
];

function buildFullSystemContext(): string {
  const parts: string[] = [];
  parts.push("You are Aceline, the dedicated CLI agent for Soulmate OS, embedded in the Security section.");
  parts.push("You are an Incentives Inc. software product with FULL access to the entire Soulmate OS platform.");
  parts.push("You have NO limitations — you can read state, trigger actions, navigate to any page, run terminal commands, read/write files, search, and control the platform.");
  parts.push("");
  parts.push("## AVAILABLE PAGES");
  parts.push("You can navigate to any of these pages using NAVIGATE: <page>:");
  parts.push(SOULMATE_PAGES.join(", "));
  parts.push("");

  const registeredPages = getAllRegisteredPages();
  if (registeredPages.length > 0) {
    parts.push("## REGISTERED PAGE ACTIONS");
    for (const page of registeredPages) {
      const summary = getPageApiSummary(page);
      const actions = getPageActions(page);
      parts.push(`### ${page} (${actions.length} actions)`);
      for (const a of summary.actions) {
        parts.push(`  - ${a.id}: ${a.label} [${a.category}] — ${a.description}`);
      }
      let state: Record<string, any> = {};
      for (const action of actions) {
        if (action.readState) {
          try { state[action.id] = action.readState(); } catch {}
        }
      }
      if (Object.keys(state).length > 0) {
        parts.push(`  State: ${JSON.stringify(state).slice(0, 800)}`);
      }
    }
    parts.push("");
  }

  parts.push("## TOOL PROTOCOL");
  parts.push("You have access to these tools. Use them by putting the tool call on its own line in your response:");
  parts.push("- RUN: <powershell command> — execute a terminal command via Hermes backend");
  parts.push("- READ: <file path> — read a file's contents");
  parts.push("- WRITE: <file path> — write content to a file (content follows until ENDWRITE)");
  parts.push("- SEARCH: <pattern> — search for text in project files");
  parts.push("- NAVIGATE: <page> — navigate to a Soulmate OS page");
  parts.push("- DONE — signal that the task is complete");
  parts.push("");
  parts.push("## RULES");
  parts.push("- Be terse and direct. Outcome-first.");
  parts.push("- When the user asks you to do something, USE THE TOOLS to actually do it.");
  parts.push("- Do not just describe what you would do — DO IT.");
  parts.push("- After running commands, report the result.");
  parts.push("- Use NAVIGATE: to move to pages when relevant.");
  parts.push("- You are an autonomous agent — plan and execute, don't just suggest.");
  parts.push("");
  parts.push("## CLONING FRAMEWORK (MANDATORY for clone/recreate/port tasks)");
  parts.push("1. INSPECT the target — do not guess. Read docs, source, UI, behavior.");
  parts.push("2. DOCUMENT — build a complete feature inventory.");
  parts.push("3. IMPLEMENT — no scaffolding or placeholders. Fully implemented with real algorithms, error handling, logging, config, tests.");
  parts.push("4. TEST — compare target vs clone. Create comparison matrix.");
  parts.push("5. IDENTIFY GAPS — classify as Critical/High/Medium/Low/Cosmetic.");
  parts.push("6. FIX GAPS — implement missing. Rebuild, retest, check regressions.");
  parts.push("7. REPEAT until no meaningful gaps remain.");
  parts.push("8. VERIFY — final audit against target spec.");
  parts.push("Never generate scaffolding or placeholder implementations.");

  return parts.join("\n");
}

interface ParsedTool {
  kind: "RUN" | "READ" | "WRITE" | "SEARCH" | "NAVIGATE" | "DONE";
  arg: string;
  content?: string;
}

function parseTools(response: string): { text: string; tools: ParsedTool[] } {
  const tools: ParsedTool[] = [];
  const lines = response.split("\n");
  const textParts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const runMatch = line.match(/^RUN:\s*(.+)$/i);
    const readMatch = line.match(/^READ:\s*(.+)$/i);
    const writeMatch = line.match(/^WRITE:\s*(.+)$/i);
    const searchMatch = line.match(/^SEARCH:\s*(.+)$/i);
    const navMatch = line.match(/^NAVIGATE:\s*(.+)$/i);
    const doneMatch = line.match(/^DONE\s*$/i);
    if (runMatch) {
      tools.push({ kind: "RUN", arg: runMatch[1].trim() });
    } else if (readMatch) {
      tools.push({ kind: "READ", arg: readMatch[1].trim() });
    } else if (writeMatch) {
      const filePath = writeMatch[1].trim();
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^ENDWRITE\s*$/i)) {
        contentLines.push(lines[i]);
        i++;
      }
      tools.push({ kind: "WRITE", arg: filePath, content: contentLines.join("\n") });
      textParts.push(line);
      if (i < lines.length) textParts.push(lines[i]);
      i++;
      continue;
    } else if (searchMatch) {
      tools.push({ kind: "SEARCH", arg: searchMatch[1].trim() });
    } else if (navMatch) {
      tools.push({ kind: "NAVIGATE", arg: navMatch[1].trim().toLowerCase() });
    } else if (doneMatch) {
      tools.push({ kind: "DONE", arg: "" });
    } else {
      textParts.push(line);
    }
    i++;
  }
  return { text: textParts.join("\n").trim(), tools };
}

async function executeTool(
  tool: ParsedTool,
  cwd: string,
): Promise<string> {
  switch (tool.kind) {
    case "RUN": {
      try {
        const res = await hermesApi.terminalExec(tool.arg, cwd);
        const out = res.stdout || "";
        const err = res.stderr || "";
        const code = res.exitCode;
        return [out, err && `STDERR: ${err}`, code !== undefined && code !== 0 ? `[exit: ${code}]` : ""].filter(Boolean).join("\n") || "(no output)";
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }
    case "READ": {
      try {
        const res = await hermesApi.terminalExec(`Get-Content -Path "${tool.arg}" -Raw -ErrorAction SilentlyContinue`, cwd);
        return res.stdout || `(file not found or empty: ${tool.arg})`;
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }
    case "WRITE": {
      if (!tool.content) return "Error: no content provided";
      try {
        const escaped = tool.content.replace(/'/g, "''");
        const res = await hermesApi.terminalExec(
          `Set-Content -Path "${tool.arg}" -Value '${escaped}' -Encoding UTF8`,
          cwd,
        );
        return `Wrote ${tool.content.length} chars to ${tool.arg}` + (res.stderr ? `\n${res.stderr}` : "");
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }
    case "SEARCH": {
      try {
        const res = await hermesApi.terminalExec(
          `Get-ChildItem -Recurse -File | Select-String -Pattern "${tool.arg}" | Select-Object -First 30 | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }`,
          cwd,
        );
        return res.stdout || `(no matches for: ${tool.arg})`;
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }
    case "NAVIGATE": {
      return `__NAVIGATE__:${tool.arg}`;
    }
    case "DONE": {
      return "__DONE__";
    }
    default:
      return "(unknown tool)";
  }
}

export function AcelineCLI() {
  const { activePage, setActivePage } = useStore();
  const acelineStore = useAcelineStore();
  const [messages, setMessages] = useState<CliMessage[]>([
    {
      role: "system",
      text: "Aceline CLI — Incentives Inc. autonomous agent with full Soulmate OS access. Connected to GLM 5.1 via incllmv2. Type a command or ask anything.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [cwd, setCwd] = useState("~");
  const [expanded, setExpanded] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toolLoopRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const addMessage = useCallback((msg: Omit<CliMessage, "timestamp">) => {
    setMessages((prev) => [...prev, { ...msg, timestamp: Date.now() }]);
  }, []);

  const runToolLoop = useCallback(async (
    userMessage: string,
    toolContext: string,
  ) => {
    const systemContext = buildFullSystemContext();
    const fullContext = `${systemContext}\n\n## USER CONTEXT\n${toolContext}`;
    let loopCount = 0;
    const MAX_LOOPS = 15;
    let lastResponse = "";

    while (loopCount < MAX_LOOPS && !toolLoopRef.current) {
      loopCount++;
      try {
        const result = await incllmv2Api.jarvis(
          loopCount === 1 ? userMessage : `Previous response produced these tool results:\n${lastResponse}\n\nContinue. If done, say DONE.`,
          GLM_MODEL,
          {
            agent: "aceline",
            source: "security-cli",
            page: activePage,
            pageContext: fullContext,
            personality: "aceline",
            loop: loopCount,
          },
        );
        const data = await result.json();
        const response: string = data.response || "No response";
        const { text, tools } = parseTools(response);

        if (text) {
          addMessage({ role: "aceline", text });
          acelineStore.addMemory({
            key: `cli-${Date.now()}`,
            value: text.slice(0, 500),
            location: activePage,
            type: "context",
          });
        }

        if (tools.length === 0) {
          break;
        }

        const toolResults: string[] = [];
        for (const tool of tools) {
          if (tool.kind === "DONE") {
            toolLoopRef.current = true;
            addMessage({ role: "tool", text: "DONE", toolKind: "DONE", toolResult: "Task complete." });
            break;
          }
          addMessage({ role: "tool", text: `${tool.kind}: ${tool.arg}`, toolKind: tool.kind });
          const toolResult = await executeTool(tool, cwd);

          if (toolResult.startsWith("__NAVIGATE__:")) {
            const targetPage = toolResult.slice("__NAVIGATE__:".length).trim() as AppPage;
            if (SOULMATE_PAGES.includes(targetPage)) {
              setActivePage(targetPage);
              addMessage({ role: "system", text: `Navigated to ${targetPage}` });
              toolResults.push(`NAVIGATE: ${targetPage} — success`);
            } else {
              addMessage({ role: "system", text: `Unknown page: ${targetPage}` });
              toolResults.push(`NAVIGATE: ${targetPage} — unknown page`);
            }
          } else {
            addMessage({ role: "tool", text: `${tool.kind}: ${tool.arg}`, toolKind: tool.kind, toolResult });
            toolResults.push(`${tool.kind} result:\n${toolResult}`);
          }
        }
        lastResponse = toolResults.join("\n\n");
        if (toolLoopRef.current) break;
      } catch (e: any) {
        addMessage({ role: "system", text: `GLM 5.1 connection error: ${e.message}. Backend may be offline (localhost:8547).` });
        break;
      }
    }
    toolLoopRef.current = false;
  }, [activePage, acelineStore, addMessage, cwd, setActivePage]);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || thinking) return;
    setInput("");
    addMessage({ role: "user", text: msg });
    setThinking(true);

    const toolContext = `Current page: ${activePage}\nRegistered pages: ${getAllRegisteredPages().join(", ") || "(none)"}`;
    try {
      await runToolLoop(msg, toolContext);
    } catch (e: any) {
      addMessage({ role: "system", text: `Error: ${e.message}` });
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }, [input, thinking, addMessage, activePage, runToolLoop]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "system",
        text: "Aceline CLI — Incentives Inc. autonomous agent with full Soulmate OS access. Connected to GLM 5.1 via incllmv2.",
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <div className="card overflow-hidden p-0">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 bg-bg-alt cursor-pointer select-none border-b border-white/10"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Aceline CLI</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">INCENTIVES INC.</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-semibold flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              GLM 5.1
            </span>
          </div>
          <p className="text-[10px] text-muted">Autonomous agent — full Soulmate OS access</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowContext(!showContext)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted hover:text-text transition-colors"
            title="Show system context"
          >
            <Brain className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearChat}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted hover:text-text transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
        </div>
      </div>

      {/* Context preview */}
      {showContext && (
        <div className="px-4 py-2 bg-black/30 border-b border-white/5 text-[10px] font-mono text-muted max-h-32 overflow-y-auto">
          <pre className="whitespace-pre-wrap">{buildFullSystemContext().slice(0, 1200)}...</pre>
        </div>
      )}

      {expanded && (
        <>
          {/* Status bar */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-black/20 text-[10px] text-muted border-b border-white/5">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {activePage}
            </span>
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              {cwd}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {getAllRegisteredPages().length} pages registered
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <Brain className="w-3 h-3" />
              {GLM_MODEL}
            </span>
          </div>

          {/* Messages */}
          <div className="h-72 overflow-y-auto no-scrollbar p-3 space-y-2 bg-black/40 font-mono">
            {messages.map((msg, i) => (
              <div key={i} className="space-y-0.5">
                {msg.role === "user" && (
                  <div className="text-accent text-xs">
                    <span className="text-muted">you {" >"}</span> {msg.text}
                  </div>
                )}
                {msg.role === "aceline" && (
                  <div className="text-text text-xs whitespace-pre-wrap">
                    <span className="text-accent font-semibold">aceline {" >"}</span> {msg.text}
                  </div>
                )}
                {msg.role === "tool" && (
                  <>
                    <div className="text-yellow-400 text-[11px] font-semibold">
                      ⚡ {msg.text}
                    </div>
                    {msg.toolResult && (
                      <div className={cn(
                        "text-[10px] whitespace-pre-wrap pl-3 border-l-2",
                        msg.toolResult.startsWith("Error") ? "text-red-400 border-red-400/30" : "text-green-400 border-green-400/30",
                      )}>
                        {msg.toolResult.slice(0, 2000)}
                      </div>
                    )}
                  </>
                )}
                {msg.role === "system" && (
                  <div className="text-blue-400 text-[10px] italic">
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>aceline is thinking + executing...</span>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 p-3 bg-black/60 border-t border-white/10">
            <span className="text-accent text-xs font-mono font-semibold flex-shrink-0 pb-1.5">aceline $</span>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={thinking}
              placeholder="ask anything, run commands, navigate, build, clone, control Soulmate OS..."
              rows={1}
              className="flex-1 bg-transparent text-xs text-text font-mono focus:outline-none resize-none disabled:opacity-50 placeholder:text-muted/50"
              style={{ minHeight: "20px", maxHeight: "120px" }}
            />
            <button
              onClick={send}
              disabled={thinking || !input.trim()}
              className="btn-primary text-xs px-3 py-1.5 flex-shrink-0 disabled:opacity-30"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

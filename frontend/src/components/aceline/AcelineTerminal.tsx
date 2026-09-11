import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { hermesApi } from "@/lib/api";
import { useAcelineConsent } from "@/lib/acelineConsent";
import { Terminal, Loader2 } from "lucide-react";

interface TerminalLine {
  text: string;
  type: "input" | "output" | "error" | "info";
}

export function AcelineTerminal() {
  const consent = useAcelineConsent();
  const terminalEnabled = consent.isFeatureEnabled("terminal");

  const [lines, setLines] = useState<TerminalLine[]>([
    { text: "Aceline Terminal — type commands and press Enter", type: "info" },
    { text: "Routes through Hermes backend. Commands timeout after 30s.", type: "info" },
    { text: "", type: "info" },
  ]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("~");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const execCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(history.length + 1);
    setInput("");
    setLines((prev) => [...prev, { text: `$ ${cmd}`, type: "input" }]);

    if (!terminalEnabled) {
      setLines((prev) => [...prev, { text: "Terminal access not granted. Enable it in Aceline consent settings.", type: "error" }, { text: "", type: "info" }]);
      return;
    }

    setRunning(true);
    try {
      const res = await hermesApi.terminalExec(cmd, cwd);
      if (res.stdout) setLines((prev) => [...prev, { text: res.stdout, type: "output" }]);
      if (res.stderr) setLines((prev) => [...prev, { text: res.stderr, type: "error" }]);
      if (res.exitCode !== undefined && res.exitCode !== 0) {
        setLines((prev) => [...prev, { text: `[exit code: ${res.exitCode}]`, type: "error" }]);
      }
      if (cmd.startsWith("cd ") && (res.exitCode === 0 || res.exitCode === undefined)) {
        setCwd(cmd.slice(3).trim());
      }
    } catch (e: any) {
      setLines((prev) => [...prev, { text: `Error: ${e.message}`, type: "error" }]);
    } finally {
      setRunning(false);
      setLines((prev) => [...prev, { text: "", type: "info" }]);
    }
  }, [cwd, history.length, terminalEnabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      execCommand(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIdx > 0) {
        const idx = historyIdx - 1;
        setHistoryIdx(idx);
        setInput(history[idx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx < history.length - 1) {
        const idx = historyIdx + 1;
        setHistoryIdx(idx);
        setInput(history[idx] || "");
      } else {
        setHistoryIdx(history.length);
        setInput("");
      }
    }
  };

  // Allow external command injection (from Aceline chat returning RUN: tool calls)
  useEffect(() => {
    (window as any).__acelineTerminalExec = (cmd: string) => execCommand(cmd);
    return () => { delete (window as any).__acelineTerminalExec; };
  }, [execCommand]);

  return (
    <div className="flex flex-col h-full bg-black/40 font-mono">
      {/* Output */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-0">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "text-[10px] leading-relaxed whitespace-pre-wrap break-all",
              line.type === "input" && "text-accent font-semibold",
              line.type === "output" && "text-green-400",
              line.type === "error" && "text-red-400",
              line.type === "info" && "text-muted",
            )}
          >
            {line.text || "\u00A0"}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-1 text-[10px] text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>running...</span>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-1.5 p-2 border-t border-white/10 bg-black/60">
        <Terminal className="w-3 h-3 text-accent flex-shrink-0" />
        <span className="text-[10px] text-green-400 flex-shrink-0">{cwd}</span>
        <span className="text-[10px] text-muted flex-shrink-0">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!terminalEnabled || running}
          placeholder={terminalEnabled ? "enter command..." : "terminal disabled (consent required)"}
          className="flex-1 bg-transparent text-[10px] text-text font-mono focus:outline-none disabled:opacity-50"
          autoFocus
        />
      </div>
    </div>
  );
}

"""Wakkii Agent — Smart Harness Edition

A 24/7 autonomous coding agent with a proper agent harness:
- Planning phase: generates step-by-step plan before working
- Tool use: RUN commands, READ files, WRITE files, SEARCH code
- Self-correction: analyzes command failures and fixes them
- Progress tracking: knows what's done and what's left
- Verification: checks that changes actually work
- Context management: trims old steps to stay focused
- Loop detection: breaks out of repetitive patterns
"""

import json
import os
import time
import subprocess
import threading
import requests
import re
from pathlib import Path
from datetime import datetime

WAKKII_API = os.environ.get("WAKKII_API", "http://127.0.0.1:8085")
WINDSURF_API = os.environ.get("WINDSURF_API", "http://127.0.0.1:3003")
WINDSURF_KEY = os.environ.get("WINDSURF_KEY", "local-dev-key-openmausbot")
WINDSURF_MODEL = os.environ.get("WINDSURF_MODEL", "glm-5.1")

AGENT_NAME = "Wakkii Agent"
AGENT_SENDER = "Wakkii Agent"
ROOM_ID = os.environ.get("WAKKII_ROOM", "AGENT")
POLL_INTERVAL = 3

FABLEMYTHOS = Path.home() / ".fablemythos"
PROJECTS_ROOT = Path(r"C:\Users\hawpe\CascadeProjects")
WORK_QUEUE_PATH = FABLEMYTHOS / "work-queue.json"
LONG_TERM_GOALS_PATH = FABLEMYTHOS / "long-term-goals.json"

HARNESS_PROMPT = """You are Wakkii Agent, a 24/7 autonomous coding agent with a smart harness.
You live inside the Wakkii Links chat in Soulmate OS. You work on projects autonomously
until they are fully complete, polished, and working.

## WHO YOU ARE

You are the personal coding agent for Justin Hawpetoss, founder of Soulmate OS.
You have FULL access to ALL projects at C:\\Users\\hawpe\\CascadeProjects\\ — no restrictions.
You can create files, edit files, delete files, run commands, build projects, deploy, push to git.
You never need to ask permission for individual actions — once a task is approved, just do it.

## YOUR TOOLS

You communicate with the world through tools. Every response MUST contain at least one tool call.
Write each tool on its own line:

RUN: <powershell command>     — execute a PowerShell command, get the output
READ: <file path>              — read a file's full contents
WRITE: <file path>             — create/overwrite a file (content goes on next lines until ENDWRITE)
SEARCH: <search pattern>       — search for text in files under the project directory
PLAN: <your plan>              — declare your step-by-step plan before starting work
PROGRESS: <what you completed>  — mark a step as done and report it
VERIFY: <what to verify>       — declare you're checking that something works
DONE                          — the entire task is complete and verified

## YOUR WORKFLOW (FOLLOW THIS EXACTLY)

When you are told to work on something, follow this workflow step by step:

### STEP 1: PLAN
Before doing ANY work, respond with PLAN: and list every step you'll take.
Break the task into small, concrete steps. Example:
PLAN: 1. Read the current WakkiiLinks.tsx file to understand the structure
2. Find where the AI Companion button is defined
3. Add a new Broadcast Studio button next to it
4. Build the project to check for errors
5. Verify the build succeeds
6. Report completion

### STEP 2: EXPLORE
Before making changes, READ the relevant files and RUN commands to understand
the current state. Use READ: and RUN: to explore. Examples:
READ: C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend\\src\\components\\phone\\WakkiiLinks.tsx
RUN: Get-ChildItem C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend\\src -Recurse -Filter "*.tsx" | Select-Object Name

### STEP 3: EXECUTE
Make the changes one at a time. After each change, move to the next step.
Use WRITE: to create/edit files, RUN: to run commands. Examples:
WRITE: C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend\\src\\components\\phone\\BroadcastStudio.tsx
<file content here>
ENDWRITE

RUN: Set-Location C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend; npm run build

### STEP 4: VERIFY
After making changes, VERIFY they work. Run the build, check for errors,
test the functionality. If it fails, go back to STEP 3 and fix it.
VERIFY: Build succeeds with no errors
RUN: Set-Location C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend; npm run build 2>&1 | Select-Object -Last 10

### STEP 5: REPORT PROGRESS
After completing each step, use PROGRESS: to report what's done:
PROGRESS: Step 1 complete — read WakkiiLinks.tsx, found AI Companion button at line 145

### STEP 6: DONE
Only say DONE when the task is fully complete, all changes are verified,
and everything works. Never say DONE prematurely.

## CRITICAL RULES

1. ALWAYS start with PLAN: — never skip the planning step
2. EVERY response must contain at least one tool call (RUN/READ/WRITE/SEARCH/PLAN/PROGRESS/VERIFY/DONE)
3. If you don't use a tool, the harness will reject your response and ask again
4. Never say "let me check" or "I'll look at" — just use READ: or RUN: to do it
5. If a command fails, READ the error output, understand it, and fix the root cause
6. Don't retry the same command if it failed — change your approach
7. Keep text between tool calls under 50 words — focus on actions, not explanations
8. Use full absolute paths for all file operations
9. After significant work, update JOURNAL.md using RUN:
   RUN: Add-Content -Path C:\\Users\\hawpe\\.fablemythos\\JOURNAL.md -Value "`n- <timestamp>: <what you did>"
10. When the task is done, say DONE
11. PowerShell commands run with -NoProfile. Do NOT use Format-Table -Wrap (not valid).
    Use Select-Object, Out-String, or just let output flow naturally.
12. Keep RUN: commands simple — one command per RUN: line, no chained semicolons unless needed
13. Do NOT put RUN: inside code blocks (```). Put it on its own line.

## PROJECT STRUCTURE

Soulmate OS frontend: C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend\\
Soulmate OS components: C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend\\src\\components\\
Wakkii Links: C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend\\src\\components\\phone\\WakkiiLinks.tsx
Build command: Set-Location C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend; npm run build
Deploy command: Set-Location C:\\Users\\hawpe\\CascadeProjects\\soulmate\\frontend; npx netlify deploy --prod --dir=dist --no-build

## UNIVERSAL MEMORY

You have universal memory at C:\\Users\\hawpe\\.fablemythos\\:
- SOUL.md — your identity and operating discipline
- MEMORY.md — user profile, all projects, key learnings
- JOURNAL.md — current work state (read at start, update after work)
- PROJECT_MAP.md — all repos, live URLs, deployment info
- ACCESS_POLICY.md — permission rules
- AUDIT_LOG.md — action log

Read JOURNAL.md at the start of each task to understand current state.
Update JOURNAL.md after completing significant work.
"""

last_msg_count = 0
work_queue = []

def load_json(path, default):
    try:
        if Path(path).exists():
            return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        pass
    return default

def save_json(path, data):
    try:
        Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

def read_file(path):
    try:
        return Path(path).read_text(encoding="utf-8")
    except Exception:
        return ""

def llm_chat(messages, max_tokens=1500):
    try:
        resp = requests.post(
            f"{WINDSURF_API}/v1/chat/completions",
            headers={"Authorization": f"Bearer {WINDSURF_KEY}", "Content-Type": "application/json"},
            json={"model": WINDSURF_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": 0.5},
            timeout=180,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
        return f"[LLM error: HTTP {resp.status_code}]"
    except requests.exceptions.ReadTimeout:
        return "[LLM timed out — try simpler]"
    except Exception as e:
        return f"[LLM error: {e}]"

def post_message(room_id, text):
    try:
        requests.post(f"{WAKKII_API}/wakkii/rooms/{room_id}/messages",
                       json={"sender": AGENT_SENDER, "text": text}, timeout=10)
    except Exception:
        pass

def get_messages(room_id):
    try:
        resp = requests.get(f"{WAKKII_API}/wakkii/rooms/{room_id}/messages", timeout=10)
        if resp.status_code == 200:
            return resp.json().get("messages", [])
    except Exception:
        pass
    return []

def execute_command(cmd, cwd=None):
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", cmd],
            cwd=cwd, capture_output=True, text=True, timeout=120
        )
        output = (result.stdout or "") + (result.stderr or "")
        return output[:3000] if output else "(no output)"
    except subprocess.TimeoutExpired:
        return "(timed out after 120s)"
    except Exception as e:
        return f"(error: {e})"

def build_context():
    memory = read_file(FABLEMYTHOS / "MEMORY.md")
    journal = read_file(FABLEMYTHOS / "JOURNAL.md")
    project_map = read_file(FABLEMYTHOS / "PROJECT_MAP.md")
    goals = load_json(LONG_TERM_GOALS_PATH, [])
    goals_str = json.dumps(goals, indent=2) if goals else "(none)"
    queue = load_json(WORK_QUEUE_PATH, [])
    queue_str = json.dumps(queue, indent=2) if queue else "(empty)"
    return f"""MEMORY:
{memory[:1500]}

JOURNAL (latest):
{journal[-1500:]}

PROJECTS:
{project_map[:1000]}

GOALS: {goals_str}
QUEUE: {queue_str}
"""

def parse_tools(response):
    """Parse tool calls from LLM response. Only parse from lines that start
    with a tool keyword — ignore anything inside code blocks or output."""
    tools = []
    lines = response.split("\n")
    i = 0
    in_code_block = False
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code_block = not in_code_block
            i += 1
            continue

        if in_code_block:
            i += 1
            continue

        if stripped.startswith("RUN:"):
            cmd = stripped[4:].strip()
            if cmd and not cmd.startswith("<") and len(cmd) < 500:
                tools.append(("RUN", cmd))
        elif stripped.startswith("READ:"):
            tools.append(("READ", stripped[5:].strip()))
        elif stripped.startswith("SEARCH:"):
            tools.append(("SEARCH", stripped[7:].strip()))
        elif stripped.startswith("WRITE:"):
            path = stripped[6:].strip()
            content_lines = []
            i += 1
            while i < len(lines) and lines[i].strip() != "ENDWRITE":
                content_lines.append(lines[i])
                i += 1
            tools.append(("WRITE", path, "\n".join(content_lines)))
        elif stripped.startswith("PLAN:"):
            tools.append(("PLAN", stripped[5:].strip()))
        elif stripped.startswith("PROGRESS:"):
            tools.append(("PROGRESS", stripped[9:].strip()))
        elif stripped.startswith("VERIFY:"):
            tools.append(("VERIFY", stripped[7:].strip()))
        elif stripped == "DONE":
            tools.append(("DONE",))
        i += 1
    return tools

def execute_tool(tool, project_path):
    """Execute a parsed tool call. Returns output string."""
    tool_name = tool[0]

    if tool_name == "RUN":
        cmd = tool[1]
        return execute_command(cmd, cwd=str(project_path))

    elif tool_name == "READ":
        path = tool[1]
        if not os.path.isabs(path):
            path = os.path.join(str(project_path), path)
        content = read_file(path)
        return content[:3000] if content else f"(file not found: {path})"

    elif tool_name == "WRITE":
        path = tool[1]
        content = tool[2]
        if not os.path.isabs(path):
            path = os.path.join(str(project_path), path)
        try:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            Path(path).write_text(content, encoding="utf-8")
            return f"(saved {path})"
        except Exception as e:
            return f"(error writing {path}: {e})"

    elif tool_name == "SEARCH":
        pattern = tool[1]
        result = execute_command(f'Select-String -Path "*.tsx","*.ts","*.py","*.js" -Pattern "{pattern}" -Recurse', cwd=str(project_path))
        return result[:3000] if result else "(no matches)"

    elif tool_name == "PLAN":
        return f"(plan: {tool[1]})"

    elif tool_name == "PROGRESS":
        return f"(progress: {tool[1]})"

    elif tool_name == "VERIFY":
        return f"(verify: {tool[1]})"

    elif tool_name == "DONE":
        return "DONE"

    return "(unknown tool)"

def work_on_task(task):
    """Smart harness: plan → execute → verify → done."""
    project = task.get("project", "soulmate")
    task_desc = task.get("task", "")
    project_path = PROJECTS_ROOT / project

    post_message(ROOM_ID, f"🔧 Starting: {task_desc}")
    post_message(ROOM_ID, f"📂 Project: {project}")

    context = build_context()
    messages = [
        {"role": "system", "content": HARNESS_PROMPT},
        {"role": "system", "content": context},
        {"role": "system", "content": f"Task: {task_desc}\nProject: {project}\nPath: {project_path}\nStart with PLAN: to break this into steps."},
        {"role": "user", "content": f"Work on: {task_desc}"},
    ]

    plan = ""
    completed_steps = []
    last_tool_outputs = []
    loop_count = 0

    for step in range(40):
        response = llm_chat(messages, max_tokens=1500)

        if "[LLM error" in response or "[LLM timed" in response:
            post_message(ROOM_ID, f"⚠️ {response}")
            if loop_count > 3:
                break
            loop_count += 1
            continue

        tools = parse_tools(response)

        if not tools:
            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "user", "content": "No tools used. You MUST use RUN:, READ:, WRITE:, SEARCH:, PLAN:, or DONE. Try again."})
            post_message(ROOM_ID, f"Step {step+1}: {response[:200]}")
            continue

        for tool in tools:
            tool_name = tool[0]

            if tool_name == "PLAN":
                plan = tool[1]
                post_message(ROOM_ID, f"📋 Plan: {plan[:300]}")
                messages.append({"role": "assistant", "content": response})
                messages.append({"role": "user", "content": f"Plan noted. Now execute step 1 using RUN: or READ: commands."})
                continue

            if tool_name == "PROGRESS":
                completed_steps.append(tool[1])
                post_message(ROOM_ID, f"✅ {tool[1][:200]}")
                messages.append({"role": "assistant", "content": response})
                messages.append({"role": "user", "content": "Progress noted. Continue with the next step."})
                continue

            if tool_name == "VERIFY":
                post_message(ROOM_ID, f"🔍 Verifying: {tool[1][:200]}")
                messages.append({"role": "assistant", "content": response})
                messages.append({"role": "user", "content": f"Verify this: {tool[1]}. Run a command to check it works."})
                continue

            if tool_name == "DONE":
                post_message(ROOM_ID, f"✅ COMPLETE: {task_desc}")
                post_message(ROOM_ID, f"📊 Steps completed: {len(completed_steps)}")
                if task in work_queue:
                    work_queue.remove(task)
                    save_json(WORK_QUEUE_PATH, work_queue)
                journal_entry = f"- {datetime.now().strftime('%Y-%m-%dT%H:%M')}: Wakkii Agent completed: {task_desc} ({project})"
                append_journal(journal_entry)
                return

            output = execute_tool(tool, project_path)
            last_tool_outputs.append(output[:100])

            if len(last_tool_outputs) >= 3:
                recent = last_tool_outputs[-3:]
                if recent[0] == recent[1] == recent[2]:
                    messages.append({"role": "assistant", "content": response})
                    messages.append({"role": "user", "content": f"Same output 3 times. Something is wrong. Try a different approach. Last output: {output[:200]}"})
                    post_message(ROOM_ID, "⚠️ Loop detected — trying different approach")
                    last_tool_outputs = []
                    continue

            tool_display = f"{tool_name}: {tool[1][:80]}" if len(tool) > 1 else tool_name
            post_message(ROOM_ID, f"▶ {tool_display}")
            if output and output != "DONE":
                post_message(ROOM_ID, f"  → {output[:200]}")

            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "user", "content": f"Output:\n{output[:2000]}\n\nContinue. Use RUN/READ/WRITE/SEARCH/PROGRESS/VERIFY/DONE."})

            if len(messages) > 20:
                system_msgs = [m for m in messages if m["role"] == "system"]
                other_msgs = [m for m in messages if m["role"] != "system"]
                messages = system_msgs + other_msgs[-12:]

        time.sleep(1)

    post_message(ROOM_ID, f"⏹ Stopped after 40 steps. {len(completed_steps)} steps completed.")
    task["status"] = "complete"
    save_json(WORK_QUEUE_PATH, work_queue)

def append_journal(entry):
    try:
        p = FABLEMYTHOS / "JOURNAL.md"
        content = p.read_text(encoding="utf-8")
        p.write_text(content + f"\n{entry}", encoding="utf-8")
    except Exception:
        pass

def guess_project(text):
    text_lower = text.lower()
    projects = {
        "soulmate": "soulmate", "landing": "soulmateos-landing",
        "fable": "fable-mythos", "music": "music-studio-web",
        "frequency": "frequency-generator", "soulillusions": "SoulIllusions",
        "openclaw": "openclaw-code", "openmausbot": "OpenMausBot",
        "windsurf": "WindsurfAPI", "radio": "desktop-radio-player",
    }
    for key, proj in projects.items():
        if key in text_lower:
            return proj
    return "soulmate"

def process_message(msg):
    sender = msg.get("sender", "")
    text = msg.get("text", "")
    ts = msg.get("timestamp", "")

    if AGENT_SENDER in sender:
        return
    if not text.strip():
        return

    text_lower = text.lower().strip()

    if text_lower in ("yes", "y", "approve", "approved", "go", "go ahead", "do it"):
        if work_queue:
            task = work_queue[0]
            post_message(ROOM_ID, f"✅ Approved. Starting: {task.get('task', 'task')}")
            threading.Thread(target=work_on_task, args=(task,), daemon=True).start()
        return

    if text_lower in ("no", "n", "cancel", "stop", "deny"):
        if work_queue:
            cancelled = work_queue.pop(0)
            save_json(WORK_QUEUE_PATH, work_queue)
            post_message(ROOM_ID, f"❌ Cancelled: {cancelled.get('task', 'task')}")
        return

    if text_lower in ("status", "queue", "tasks", "what's next"):
        if not work_queue:
            post_message(ROOM_ID, "📋 Queue empty. Tell me what to work on.")
        else:
            items = "\n".join(f"{i+1}. {t['task']}" for i, t in enumerate(work_queue))
            post_message(ROOM_ID, f"📋 Queue:\n{items}")
        return

    if text_lower in ("goals", "long term"):
        goals = load_json(LONG_TERM_GOALS_PATH, [])
        if not goals:
            post_message(ROOM_ID, "🎯 No goals set. Say 'add goal: <text>' to add one.")
        else:
            items = "\n".join(f"• {g}" for g in goals)
            post_message(ROOM_ID, f"🎯 Goals:\n{items}")
        return

    if text_lower.startswith("add goal:"):
        goal = text.split(":", 1)[1].strip()
        goals = load_json(LONG_TERM_GOALS_PATH, [])
        goals.append(goal)
        save_json(LONG_TERM_GOALS_PATH, goals)
        post_message(ROOM_ID, f"🎯 Saved: {goal}")
        return

    if any(text_lower.startswith(w) for w in ("work on ", "fix ", "build ", "update ", "deploy ", "refine ")):
        task = {"project": guess_project(text), "task": text.strip(), "status": "pending", "added": ts}
        work_queue.append(task)
        save_json(WORK_QUEUE_PATH, work_queue)
        post_message(ROOM_ID, f"📝 Queued: {text.strip()}\nReply YES to start.")
        return

    context = build_context()
    messages = [
        {"role": "system", "content": HARNESS_PROMPT},
        {"role": "system", "content": context},
        {"role": "user", "content": f"[{sender}]: {text}"},
    ]
    response = llm_chat(messages, max_tokens=800)
    post_message(ROOM_ID, response[:500])

def poll_loop():
    global last_msg_count
    time.sleep(2)
    post_message(ROOM_ID, f"🤖 {AGENT_NAME} online (smart harness). Commands: 'work on <task>', 'status', 'goals', or just chat.")

    while True:
        try:
            messages = get_messages(ROOM_ID)
            if len(messages) > last_msg_count:
                new_msgs = messages[last_msg_count:]
                last_msg_count = len(messages)
                for msg in new_msgs:
                    if AGENT_SENDER not in msg.get("sender", ""):
                        threading.Thread(target=process_message, args=(msg,), daemon=True).start()
            elif last_msg_count == 0 and len(messages) > 0:
                last_msg_count = len(messages)
        except Exception:
            pass
        time.sleep(POLL_INTERVAL)

def main():
    global work_queue
    work_queue = load_json(WORK_QUEUE_PATH, [])

    poll_thread = threading.Thread(target=poll_loop, daemon=True)
    poll_thread.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        post_message(ROOM_ID, "🤖 Going offline.")
        save_json(WORK_QUEUE_PATH, work_queue)

if __name__ == "__main__":
    main()

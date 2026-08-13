"""Code writing skill creation — watches its own code output and creates code skills.

incllmv2 watches every piece of code it writes and learns from it:
- Language, framework, and pattern detection
- Successful code (user didn't ask for fixes → code was correct)
- Code style preferences (functional, OOP, etc.)
- Common patterns that work well (reusable snippets)
- Error patterns to avoid (code that needed fixing)

Creates "code skills" that improve future code generation.
These skills are shared via the universal recursive link — all instances learn.

Zero-slowdown: runs AFTER the response is sent, in a background task.
Never touches the LLM inference pipeline.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any

from inc_llm.memory.manager import MemoryManager
from inc_llm.skills.skill_manager import SkillManager

logger = logging.getLogger(__name__)


class CodeSkillCreator:
    """Creates code skills from the LLM's own code output.

    Runs post-turn in background — zero-slowdown.
    """

    def __init__(self, memory: MemoryManager, skill_manager: SkillManager) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self._code_history: list[dict[str, Any]] = []
        self._pattern_stats: dict[str, dict[str, Any]] = {}

    async def analyze_and_learn(
        self, user_id: str, user_message: str, assistant_response: str,
        session_id: str = "", user_followed_up: bool = False,
    ) -> dict[str, Any]:
        """Analyze code in the response and create/update code skills.

        Called AFTER response is sent — background task, zero-slowdown.
        """
        code_blocks = self._extract_code_blocks(assistant_response)
        if not code_blocks:
            return {"status": "no_code", "message": "No code blocks found in response"}

        results = []
        for block in code_blocks:
            analysis = self._analyze_code_block(block, user_message)
            if analysis["language"]:
                result = await self._create_or_update_skill(
                    user_id, analysis, user_followed_up, session_id,
                )
                results.append(result)
                self._record_pattern(analysis, user_followed_up)

        if self._should_create_cross_language_skill():
            cross_result = await self._create_cross_language_skill()
            if cross_result:
                results.append(cross_result)

        return {"status": "ok", "skills_processed": len(results), "results": results}

    def _extract_code_blocks(self, text: str) -> list[dict[str, str]]:
        """Extract code blocks from markdown-formatted text."""
        blocks = []
        pattern = r"```(\w+)?\n(.*?)```"
        matches = re.findall(pattern, text, re.DOTALL)
        for lang, code in matches:
            blocks.append({
                "language": lang.lower() if lang else "unknown",
                "code": code.strip(),
            })
        return blocks

    def _analyze_code_block(self, block: dict[str, str], user_message: str) -> dict[str, Any]:
        """Analyze a code block for patterns, style, and quality indicators."""
        code = block["code"]
        language = block["language"]
        lines = code.split("\n")
        non_empty_lines = [l for l in lines if l.strip()]

        analysis: dict[str, Any] = {
            "language": language,
            "line_count": len(lines),
            "code_size": len(code),
            "patterns": [],
            "style": {},
            "task_type": "",
            "complexity": "low",
        }

        if language in ("python", "py"):
            analysis.update(self._analyze_python(code))
        elif language in ("javascript", "js", "typescript", "ts"):
            analysis.update(self._analyze_javascript(code))
        elif language in ("go", "golang"):
            analysis.update(self._analyze_go(code))
        elif language in ("rust", "rs"):
            analysis.update(self._analyze_rust(code))
        elif language in ("sql",):
            analysis.update(self._analyze_sql(code))
        else:
            analysis.update(self._analyze_generic(code))

        if any(kw in user_message.lower() for kw in ("function", "method", "helper")):
            analysis["task_type"] = "function"
        elif any(kw in user_message.lower() for kw in ("class", "object", "model")):
            analysis["task_type"] = "class"
        elif any(kw in user_message.lower() for kw in ("api", "endpoint", "route")):
            analysis["task_type"] = "api"
        elif any(kw in user_message.lower() for kw in ("test", "spec", "pytest")):
            analysis["task_type"] = "test"
        elif any(kw in user_message.lower() for kw in ("fix", "bug", "debug", "error")):
            analysis["task_type"] = "bugfix"
        elif any(kw in user_message.lower() for kw in ("refactor", "optimize", "improve")):
            analysis["task_type"] = "refactor"
        else:
            analysis["task_type"] = "general"

        if analysis["line_count"] > 100:
            analysis["complexity"] = "high"
        elif analysis["line_count"] > 30:
            analysis["complexity"] = "medium"

        return analysis

    def _analyze_python(self, code: str) -> dict[str, Any]:
        patterns = []
        style = {}

        if re.search(r"\basync\s+def\b", code):
            patterns.append("async_function")
        if re.search(r"\bclass\b", code):
            patterns.append("class_definition")
        if re.search(r"\b@dataclass\b", code):
            patterns.append("dataclass")
        if re.search(r"\btyping\.\b|->\s*str|->\s*int|->\s*bool|->\s*list|->\s*dict", code):
            style["type_hints"] = True
            patterns.append("type_hints")
        if re.search(r"\bfrom\s+__future__\s+import\s+annotations\b", code):
            style["future_annotations"] = True
        if re.search(r"\bif\s+__name__\s*==\s*['\"]__main__['\"]", code):
            patterns.append("main_guard")
        if re.search(r"\btry:\s.*\bexcept\b", code, re.DOTALL):
            patterns.append("error_handling")
        if re.search(r"\bwith\s+open\b", code):
            patterns.append("context_manager")
        if re.search(r"\blist\[|dict\[|tuple\[", code):
            style["modern_generics"] = True
        if re.search(r"\bf-string\b|f['\"]", code):
            style["f_strings"] = True
        if re.search(r"\bmatch\s+.*:\s*\ncase\b", code, re.DOTALL):
            patterns.append("match_case")
        if re.search(r"\b@property\b", code):
            patterns.append("property_decorator")
        if re.search(r"\b@staticmethod\b|\b@classmethod\b", code):
            patterns.append("method_decorators")

        style["uses_decorators"] = bool(re.search(r"@\w+", code))
        return {"patterns": patterns, "style": style}

    def _analyze_javascript(self, code: str) -> dict[str, Any]:
        patterns = []
        style = {}

        if re.search(r"\basync\s+function\b|=>\s*await\b", code):
            patterns.append("async_function")
        if re.search(r"=>\s*{?\s*$|=>\s*\(", code, re.MULTILINE):
            patterns.append("arrow_function")
        if re.search(r"\bclass\b", code):
            patterns.append("class_definition")
        if re.search(r"\binterface\b|\btype\s+\w+\s*=", code):
            style["typescript_types"] = True
            patterns.append("type_definitions")
        if re.search(r"\bexport\s+(default\s+)?(function|class|const|let)\b", code):
            patterns.append("es_modules")
        if re.search(r"\btry\s*{.*}\s*catch\b", code, re.DOTALL):
            patterns.append("error_handling")
        if re.search(r"\buseEffect\b|\buseState\b|\buseCallback\b", code):
            patterns.append("react_hooks")
        if re.search(r"\bconst\b.*=\s*require\b", code):
            style["commonjs"] = True
        if re.search(r"\bimport\s+.*\s+from\s+['\"]", code):
            style["esm"] = True

        return {"patterns": patterns, "style": style}

    def _analyze_go(self, code: str) -> dict[str, Any]:
        patterns = []
        style = {}

        if re.search(r"\bfunc\b.*\{", code):
            patterns.append("function")
        if re.search(r"\btype\s+\w+\s+struct\b", code):
            patterns.append("struct")
        if re.search(r"\bgo\s+func\b", code):
            patterns.append("goroutine")
        if re.search(r"\bchan\b", code):
            patterns.append("channel")
        if re.search(r"\binterface\s*{", code):
            patterns.append("interface")
        if re.search(r"\bdefer\b", code):
            patterns.append("defer")
        if re.search(r"\berr\s*!=\s*nil\b", code):
            patterns.append("error_check")

        return {"patterns": patterns, "style": style}

    def _analyze_rust(self, code: str) -> dict[str, Any]:
        patterns = []
        style = {}

        if re.search(r"\bfn\b", code):
            patterns.append("function")
        if re.search(r"\bstruct\b", code):
            patterns.append("struct")
        if re.search(r"\benum\b", code):
            patterns.append("enum")
        if re.search(r"\bimpl\b", code):
            patterns.append("impl_block")
        if re.search(r"\btrait\b", code):
            patterns.append("trait")
        if re.search(r"\bmatch\b", code):
            patterns.append("match")
        if re.search(r"\bResult<|Option<", code):
            patterns.append("result_option")
        if re.search(r"\bunwrap\(\)|\bexpect\(", code):
            patterns.append("unwrap")

        return {"patterns": patterns, "style": style}

    def _analyze_sql(self, code: str) -> dict[str, Any]:
        patterns = []
        style = {}

        if re.search(r"\bSELECT\b.*\bFROM\b", code, re.IGNORECASE):
            patterns.append("select")
        if re.search(r"\bJOIN\b", code, re.IGNORECASE):
            patterns.append("join")
        if re.search(r"\bINDEX\b", code, re.IGNORECASE):
            patterns.append("index")
        if re.search(r"\bWHERE\b", code, re.IGNORECASE):
            patterns.append("where_clause")
        if re.search(r"\bGROUP\s+BY\b", code, re.IGNORECASE):
            patterns.append("group_by")
        if re.search(r"\bCREATE\s+TABLE\b", code, re.IGNORECASE):
            patterns.append("create_table")

        return {"patterns": patterns, "style": style}

    def _analyze_generic(self, code: str) -> dict[str, Any]:
        patterns = []
        if re.search(r"\bfunction\b|\bdef\b|\bfunc\b|\bfn\b", code):
            patterns.append("function")
        if re.search(r"\bclass\b|\bstruct\b|\bobject\b", code):
            patterns.append("data_structure")
        if re.search(r"\bif\b.*\belse\b", code):
            patterns.append("conditional")
        if re.search(r"\bfor\b|\bwhile\b|\bloop\b", code):
            patterns.append("loop")
        return {"patterns": patterns, "style": {}}

    async def _create_or_update_skill(
        self, user_id: str, analysis: dict[str, Any], was_correct: bool,
        session_id: str,
    ) -> dict[str, Any]:
        """Create or update a code skill based on analysis."""
        language = analysis["language"]
        task_type = analysis["task_type"]
        skill_name = f"code-{language}-{task_type}"

        existing = self.skill_manager.memory.semantic.get_skill(skill_name)
        if existing:
            content = self._build_skill_content(analysis, was_correct, existing.content)
            self.skill_manager.update(skill_name, content=content)
            logger.info("Updated code skill: %s (correct=%s)", skill_name, was_correct)
            return {"status": "updated", "skill_name": skill_name, "language": language}

        content = self._build_skill_content(analysis, was_correct, "")
        result = self.skill_manager.create(
            name=skill_name,
            description=f"Code pattern: {language} {task_type} (complexity: {analysis['complexity']})",
            content=content,
            category="coding",
            trigger_conditions=[
                f"writing {language} code",
                f"task type is {task_type}",
            ],
        )

        if result.success:
            logger.info("Created code skill: %s", skill_name)
            return {"status": "created", "skill_name": skill_name, "language": language}
        return {"status": "error", "message": result.message}

    def _build_skill_content(
        self, analysis: dict[str, Any], was_correct: bool, existing: str,
    ) -> str:
        """Build skill content from code analysis."""
        lines = [
            f"Code Skill: {analysis['language']} — {analysis['task_type']}",
            f"Complexity: {analysis['complexity']}",
            f"Patterns detected: {', '.join(analysis['patterns']) or 'none'}",
            f"Style: {json.dumps(analysis['style'])}",
            f"Was correct (no follow-up fix needed): {was_correct}",
            "",
            "Guidelines for this pattern:",
        ]

        if "async_function" in analysis["patterns"]:
            lines.append("- Use async/await for I/O operations")
            lines.append("- Avoid blocking calls in async functions")
        if "type_hints" in analysis.get("style", {}):
            lines.append("- Include type hints on all functions")
        if "error_handling" in analysis["patterns"]:
            lines.append("- Include proper error handling with try/except")
        if "context_manager" in analysis["patterns"]:
            lines.append("- Use context managers for resource management")
        if "class_definition" in analysis["patterns"]:
            lines.append("- Define clear class interfaces")
        if "arrow_function" in analysis["patterns"]:
            lines.append("- Prefer arrow functions for callbacks")

        if analysis["complexity"] == "high":
            lines.append("- Break complex code into smaller functions")
            lines.append("- Add docstrings/comments for non-obvious logic")

        if not was_correct:
            lines.append("- WARNING: Previous code in this pattern needed fixes — double-check correctness")

        return "\n".join(lines)

    def _record_pattern(self, analysis: dict[str, Any], was_correct: bool) -> None:
        """Record pattern statistics for cross-language learning."""
        for pattern in analysis["patterns"]:
            if pattern not in self._pattern_stats:
                self._pattern_stats[pattern] = {
                    "count": 0,
                    "correct": 0,
                    "languages": set(),
                }
            self._pattern_stats[pattern]["count"] += 1
            if was_correct:
                self._pattern_stats[pattern]["correct"] += 1
            self._pattern_stats[pattern]["languages"].add(analysis["language"])

    def _should_create_cross_language_skill(self) -> bool:
        """Check if we have enough data to create a cross-language pattern skill."""
        return any(
            stats["count"] >= 5 and len(stats["languages"]) >= 2
            for stats in self._pattern_stats.values()
        )

    async def _create_cross_language_skill(self) -> dict[str, Any] | None:
        """Create a skill that captures patterns across multiple languages."""
        for pattern, stats in self._pattern_stats.items():
            if stats["count"] >= 5 and len(stats["languages"]) >= 2:
                skill_name = f"code-cross-{pattern}"
                existing = self.skill_manager.memory.semantic.get_skill(skill_name)
                if existing:
                    continue

                success_rate = stats["correct"] / stats["count"] if stats["count"] > 0 else 0
                content = (
                    f"Cross-Language Pattern: {pattern}\n"
                    f"Observed in: {', '.join(sorted(stats['languages']))}\n"
                    f"Success rate: {success_rate:.0%} ({stats['correct']}/{stats['count']})\n\n"
                    f"This pattern appears across multiple languages. Apply the same "
                    f"conceptual approach when writing code in any language."
                )
                result = self.skill_manager.create(
                    name=skill_name,
                    description=f"Cross-language pattern: {pattern}",
                    content=content,
                    category="coding",
                    trigger_conditions=[f"writing code with {pattern} pattern"],
                )
                if result.success:
                    logger.info("Created cross-language skill: %s", skill_name)
                    return {"status": "created", "skill_name": skill_name}
        return None

    def get_code_skill_stats(self) -> dict[str, Any]:
        """Get statistics about code skills learned (for dashboard)."""
        return {
            "total_code_analyzed": len(self._code_history),
            "patterns_tracked": {
                p: {
                    "count": s["count"],
                    "correct": s["correct"],
                    "languages": list(s["languages"]),
                }
                for p, s in self._pattern_stats.items()
            },
        }

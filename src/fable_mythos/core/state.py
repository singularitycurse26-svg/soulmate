"""Structured state model for the Fable-Mythos reasoning loop.

Merges Mythos's structured latent state (facts, assumptions, hypotheses,
contradictions, artifacts) with Fable's think/act/prove methodology
(classify, define done, evidence, decide, act, verify, report).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class LoopPhase(str, Enum):
    """The 9 phases of the Fable-Mythos reasoning loop.

    Merges Fable's think/act/prove with Mythos's explore/solve/verify/repair/synthesize.
    """

    CLASSIFY = "classify"        # Fable Step 0: classify the ask
    DEFINE_DONE = "define_done"  # Fable Step 1: define what done looks like
    EVIDENCE = "evidence"        # Fable Step 2 + Mythos explore: gather evidence
    DECIDE = "decide"            # Fable Step 3: synthesize evidence into one recommendation
    ACT = "act"                  # Fable Step 4 + Mythos solve: act surgically
    VERIFY = "verify"            # Fable Step 5 + Mythos verify: verify by observation
    REPAIR = "repair"            # Mythos repair: fix contradictions/weak confidence
    SYNTHESIZE = "synthesize"    # Mythos synthesize: build final answer
    JUDGE = "judge"              # Fable Step 5c: adversarial judge pass
    REPORT = "report"            # Fable Step 6: report outcome-first

    @classmethod
    def in_order(cls) -> list["LoopPhase"]:
        """Return all phases in execution order."""
        return [
            cls.CLASSIFY,
            cls.DEFINE_DONE,
            cls.EVIDENCE,
            cls.DECIDE,
            cls.ACT,
            cls.VERIFY,
            cls.REPAIR,
            cls.SYNTHESIZE,
            cls.JUDGE,
            cls.REPORT,
        ]


class AskShape(str, Enum):
    """Fable Step 0 classification — what shape is the ask?"""

    TRIVIAL = "trivial"        # one file, <10 lines, no searching → just do it
    QUESTION = "question"      # assessment/diagnosis, change nothing
    TASK = "task"              # fix/build/change, deliver completed change
    PLAN_FIRST = "plan_first"  # ambiguous scope, irreversible, or plan requested


@dataclass
class GroundedFact:
    """A fact grounded in a source — the foundation of evidence-based reasoning."""

    claim: str
    source: str  # "user_input", "file:src/main.py:42", "memory:episode_5", etc.
    confidence: float
    loop_introduced: int


@dataclass
class Assumption:
    """An explicit assumption — stated, not hidden."""

    statement: str
    rationale: str
    resolved: bool = False
    resolution: str | None = None


@dataclass
class Hypothesis:
    """A competing hypothesis in the branch manager."""

    id: str
    answer: str
    reasoning_path: list[str] = field(default_factory=list)
    confidence: float = 0.5
    contradictions: list[str] = field(default_factory=list)
    supporting_tests: list[str] = field(default_factory=list)
    alive: bool = True


@dataclass
class Contradiction:
    """A detected contradiction between two claims."""

    claim_a: str
    claim_b: str
    severity: float
    loop_detected: int


@dataclass
class VerificationArtifact:
    """Evidence from a verification step — observed, not inferred."""

    kind: str  # "judge_result", "test_run", "lint_check", "build_check"
    content: str
    passes: bool
    loop_produced: int


@dataclass
class IntentLine:
    """Fable Step 4 INTENT line — required before any behavior-changing edit."""

    code_does: str       # X: what the code currently does
    task_expects: str    # Y: what the failing check/task expects
    spec_says: str       # Z: what the spec (README/docs/docstring) says
    agreement: bool      # do X, Y, Z all agree?


@dataclass
class StructuredState:
    """The structured latent state — the agent's working memory of the problem.

    This is the heart of the Mythos approach: instead of free-form reasoning,
    the agent maintains explicit facts, assumptions, hypotheses, contradictions,
    and verification artifacts throughout the loop.
    """

    facts: list[GroundedFact] = field(default_factory=list)
    assumptions: list[Assumption] = field(default_factory=list)
    hypotheses: list[Hypothesis] = field(default_factory=list)
    contradictions: list[Contradiction] = field(default_factory=list)
    artifacts: list[VerificationArtifact] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)
    confidence_map: dict[str, float] = field(default_factory=dict)

    # Fable-specific
    intent_line: IntentLine | None = None
    auth_line: str | None = None  # AUTH: user said "..." for irreversible actions
    twins_line: str | None = None  # TWINS: searched <pattern> - found N other sites
    pending_line: str | None = None  # PENDING: <action> - awaiting authorization

    def active_hypotheses(self) -> list[Hypothesis]:
        """Return only alive hypotheses."""
        return [h for h in self.hypotheses if h.alive]

    def should_branch(self) -> bool:
        """Determine if we should spawn a new hypothesis branch."""
        top = self.active_hypotheses()
        if len(top) >= 3:
            return False
        if any(c.severity > 0.6 for c in self.contradictions):
            return True
        if top and max(h.confidence for h in top) < 0.5:
            return True
        # High confidence and no contradictions — don't branch even with 1 hypothesis
        if top and max(h.confidence for h in top) >= 0.5 and not self.contradictions:
            return False
        return len(top) <= 1

    def top_hypothesis(self) -> Hypothesis | None:
        """Return the highest-confidence alive hypothesis."""
        live = self.active_hypotheses()
        if not live:
            return None
        return max(live, key=lambda item: item.confidence)

    def add_fact(self, claim: str, source: str, confidence: float = 0.8, loop: int = 0) -> None:
        """Add a grounded fact to the state."""
        self.facts.append(GroundedFact(claim=claim, source=source, confidence=confidence, loop_introduced=loop))

    def add_contradiction(self, claim_a: str, claim_b: str, severity: float, loop: int = 0) -> None:
        """Record a contradiction between two claims."""
        self.contradictions.append(Contradiction(claim_a=claim_a, claim_b=claim_b, severity=severity, loop_detected=loop))

    def add_artifact(self, kind: str, content: str, passes: bool, loop: int = 0) -> None:
        """Add a verification artifact."""
        self.artifacts.append(VerificationArtifact(kind=kind, content=content, passes=passes, loop_produced=loop))

    def as_dict(self) -> dict[str, Any]:
        """Serialize to dict (excluding None optional fields for cleanliness)."""
        d = asdict(self)
        # Remove None optional fields
        for key in ("intent_line", "auth_line", "twins_line", "pending_line"):
            if d.get(key) is None:
                del d[key]
        return d

    @staticmethod
    def from_dict(payload: dict[str, Any]) -> "StructuredState":
        """Deserialize from dict."""
        state = StructuredState(
            facts=[GroundedFact(**item) for item in payload.get("facts", [])],
            assumptions=[Assumption(**item) for item in payload.get("assumptions", [])],
            hypotheses=[Hypothesis(**item) for item in payload.get("hypotheses", [])],
            contradictions=[Contradiction(**item) for item in payload.get("contradictions", [])],
            artifacts=[VerificationArtifact(**item) for item in payload.get("artifacts", [])],
            trace=list(payload.get("trace", [])),
            confidence_map=dict(payload.get("confidence_map", {})),
        )
        intent = payload.get("intent_line")
        if intent and isinstance(intent, dict):
            state.intent_line = IntentLine(**intent)
        state.auth_line = payload.get("auth_line")
        state.twins_line = payload.get("twins_line")
        state.pending_line = payload.get("pending_line")
        return state


@dataclass
class FableMythosState:
    """Top-level state for a single reasoning session.

    Wraps the structured state with session metadata, triage results,
    and loop control. This is what flows through the entire pipeline.
    """

    query: str
    thread_id: str
    constraints: dict[str, Any] = field(default_factory=dict)

    # Triage results
    triage: dict[str, Any] = field(default_factory=dict)
    ask_shape: AskShape = AskShape.TASK
    domain: str = "coding"

    # Prelude
    encoded_input: str = ""
    beta: float = 0.0  # exploration vs exploitation weight

    # Structured latent state
    structured_state: StructuredState = field(default_factory=StructuredState)

    # Retrieved memories (from 3-layer memory system)
    retrieved_memories: list[StructuredState] = field(default_factory=list)
    retrieved_episodes: list[dict[str, Any]] = field(default_factory=list)
    retrieved_skills: list[dict[str, Any]] = field(default_factory=list)

    # Loop control
    phase: LoopPhase = LoopPhase.CLASSIFY
    loop_index: int = 0
    max_loops: int = 6
    repair_cycles: int = 0
    converged: bool = False
    halt_reason: str = ""

    # Output
    final_answer: str = ""
    citations: list[str] = field(default_factory=list)
    confidence_summary: dict[str, float] = field(default_factory=dict)
    per_loop_metrics: list[dict[str, Any]] = field(default_factory=list)

    # Metadata
    trajectory_id: str | None = None

    def advance_phase(self) -> None:
        """Advance to the next phase in the loop."""
        order = LoopPhase.in_order()
        idx = order.index(self.phase)
        next_idx = (idx + 1) % len(order)
        self.phase = order[next_idx]

    def should_halt(self, confidence_threshold: float) -> bool:
        """Determine if the loop should stop."""
        top = self.structured_state.top_hypothesis()
        top_confidence = top.confidence if top else 0.0

        if self.loop_index >= self.max_loops:
            self.halt_reason = "max_loops"
            return True

        if self.converged and top_confidence >= confidence_threshold:
            self.halt_reason = "converged_confident"
            return True

        if self.repair_cycles >= 3:
            self.halt_reason = "max_repair_cycles"
            return True

        return False

    def record_loop_metrics(self) -> None:
        """Record metrics for the current loop iteration."""
        top = self.structured_state.top_hypothesis()
        self.per_loop_metrics.append({
            "loop": self.loop_index,
            "phase": self.phase.value,
            "active_hypotheses": len(self.structured_state.active_hypotheses()),
            "top_confidence": top.confidence if top else 0.0,
            "contradictions": len(self.structured_state.contradictions),
            "converged": self.converged,
        })

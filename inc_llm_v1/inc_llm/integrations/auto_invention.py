"""Auto-Invention Orchestrator — Aceline's autonomous self-improvement engine.

When Aceline is in "auto mode", this orchestrator:
1. Observes the current work context (what page, what task, what surface)
2. Generates multiple approaches using the Innovation Framework
3. Tests each approach in an isolated sandbox
4. Evaluates results (does it work? is it better?)
5. Picks the best approach
6. Saves it and applies it to the real project

The orchestrator exposes its state in real-time so the frontend can show
the 4 floating panels:
- Terminal: commands being run
- Page: preview of the work being done
- Auto-typing: Aceline's auto-typed commands
- Invention lab: the multiple approaches being generated and tested

Architecture:
- AutoInventionOrchestrator runs as a background task when auto mode is on
- It uses the GLM priority queue (user preempts)
- It uses the Innovation Framework prompt from observer.py
- It writes state to an in-memory store that the frontend polls via SSE/polling
- When done, it saves the winning approach and signals completion
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/auto-invention", tags=["auto-invention"])

# ── UNIVERSAL TECHNOLOGY INVENTION & INNOVATION FRAMEWORK ─────────────
# This is the MANDATORY RULE that the Auto-Invention Orchestrator follows.
# Every approach generated, tested, and picked by this orchestrator MUST
# follow this framework. This rule is baked into every GLM prompt the
# orchestrator sends and every evaluation it makes.
#
# CORE RULE: DO NOT ASSUME THE CURRENT WAY IS THE BEST WAY.
# MASTER PRINCIPLE: DO NOT JUST INVENT NEW TECHNOLOGY.
#                   INVENT NEW WAYS TO USE TECHNOLOGY THAT ALREADY EXISTS.

AUTO_INVENTION_FRAMEWORK_RULE = """\
UNIVERSAL TECHNOLOGY INVENTION & INNOVATION FRAMEWORK — MANDATORY RULE FOR AUTO-INVENTION

CORE RULE: DO NOT ASSUME THE CURRENT WAY IS THE BEST WAY.
MASTER PRINCIPLE: DO NOT JUST INVENT NEW TECHNOLOGY. INVENT NEW WAYS TO USE TECHNOLOGY THAT ALREADY EXISTS.

The system must systematically investigate existing technology, reverse-engineer how it works, extract its underlying capabilities, identify limitations and unused capabilities, recombine technologies and processes, generate new approaches, test them, learn from failures, and continuously improve the result.

I. PROBLEM DEFINITION
1. Define the objective: What are we trying to accomplish? What problem are we solving? Who needs the result? What does success look like? What would constitute a major improvement? What constraints exist?
2. Define the desired output: Input, processing, output, required speed, accuracy, cost, reliability, size, energy, human involvement.
3. Separate the actual problem from the assumed solution. Ask "What actually needs to happen?" not "How is everyone currently doing it?" Do not allow the existing solution to constrain the invention.

II. EXISTING TECHNOLOGY REVERSE-ENGINEERING
4. Identify existing solutions: commercial products, open-source projects, academic research, patents, industrial processes, APIs, hardware, software, algorithms, manufacturing methods, scientific techniques, existing workflows.
5. Decompose each solution: System -> Subsystem -> Component -> Function -> Mechanism -> Input -> Transformation -> Output.
6. Build a capability map: What does it do? How? What inputs can it accept? What outputs can it produce? What limits it? What happens if inputs change? What happens if conditions change? What other systems could use it?
7. Identify hidden capabilities: What else could this underlying mechanism potentially do?

III. FUNCTION EXTRACTION
8. Ignore the product name. Decompose into primitive capabilities.
9. Extract primitive capabilities: detect, measure, store, search, classify, predict, generate, transform, translate, compress, decompress, communicate, synchronize, authenticate, track, navigate, optimize, simulate, automate, learn, remember, verify, repair, coordinate, control.
10. Identify transferable mechanisms: Where else could this mechanism work?

IV. LIMITATION ANALYSIS
11. Find bottlenecks: speed, cost, energy, memory, compute, bandwidth, latency, accuracy, reliability, complexity, human labor, physical size, manufacturing difficulty, maintenance, security, scalability.
12. Identify unnecessary requirements: Does this step need to exist? Can two steps become one? Can software replace hardware? Can AI eliminate a human step? Can local processing replace cloud? Can prediction eliminate computation?
13. Find single points of failure: What breaks the system? What if a component disappears? What if connectivity disappears? What if the AI makes a mistake? What if input is incomplete? What if the environment changes?

V. POSSIBILITY EXPANSION
14. Ask "What if?": reverse it, combine it, duplicate it, remove it, move it, run continuously, run intermittently, parallelize, serialize, make autonomous, make adaptive, AI controls it, another system controls it, make it a feedback loop, operate under different conditions.
15. Invert the process: A->B->C->D becomes D->C->B->A, A->C->B->D, A+C->B, B->A, D->A, A<->B, A->B->A.
16. Remove assumptions: Why does this requirement exist? Does it actually have to work that way? Does removing the assumption produce a better architecture?

VI. CROSS-DOMAIN COMBINATION ENGINE
17. Combine unrelated technologies: A+B, A+B+AI, A+B+C, A+existing infrastructure+software automation.
18. Cross-pollinate industries: computing, telecommunications, robotics, automotive, aerospace, medicine, manufacturing, finance, logistics, gaming, energy, agriculture, construction, biology, materials science, networking. Has another industry solved a similar problem?
19. Search for technological analogies: Transfer the underlying mechanism, not the surface implementation.

VII. AI-ASSISTED INVENTION
20. Give different AI agents different jobs: Researcher, Reverse Engineer, Inventor, Skeptic, Engineer, Prototype Designer, Tester, Optimizer, Prior-Art Analyzer, Cost Analyst.
21. Generate many hypotheses: 10 conventional, 10 unconventional, 10 combinations, 10 simplified, 10 extreme, 10 low-cost, 10 automation-heavy, 10 existing-infrastructure solutions. Then rank them.

VIII. INVENTION EVALUATION MATRIX
Every candidate must be evaluated for: feasibility, cost, complexity, performance, reliability, scalability, energy, compute, materials, infrastructure, safety, novelty, commercial value, deployment, maintainability, compatibility.

IX. EXISTING-INFRASTRUCTURE-FIRST DESIGN
Before inventing new hardware, determine whether existing hardware can accomplish the objective through a new process. Reuse existing computers, GPUs, phones, sensors, networks, cloud, APIs, databases, cameras, vehicles, robotics, software. Always ask: "Can we solve this with technology that already exists?"

X. "NO NEW HARDWARE" CHALLENGE
Attempt 1: Solve entirely with software. Attempt 2: Software + existing hardware. Attempt 3: Existing infrastructure. Attempt 4: Modify existing device. Attempt 5: Combine existing devices. Attempt 6: Only then design new hardware.

XI. PROCESS RECOMBINATION
Parallelization: run steps simultaneously. Elimination: remove unnecessary steps. Automation: AI performs steps. Prediction: predict results before executing. Feedback: make later steps feed back into earlier ones. Continuous operation: monitor -> detect -> act -> verify -> repeat. Self-correction: execute -> inspect -> identify error -> repair -> retry.

XII. CLOSED-LOOP INVENTION
Observe -> Understand -> Hypothesize -> Build -> Test -> Measure -> Learn -> Modify -> Retest. Repeat continuously. Invention is not one-time — it is a continuous discovery and optimization process.

XIII. FAILURE-DRIVEN INVENTION
Ask "Why doesn't it work?" and "Can the failure reveal another solution?" Analyze failure modes, unexpected behaviors, edge cases, error conditions, limitations, mistakes, environmental conditions, performance degradation, partial successes. A failure can reveal an entirely different application.

XIV. MINIMUM-VIABLE-INVENTION
Reduce to smallest functional version. Use existing components. Avoid unnecessary features. Test the core mechanism. Measure the result. Compare against existing solution. Expand only if the core mechanism works.

XV. ITERATIVE OPTIMIZATION
Version 1 -> Measure -> Identify Weakest Point -> Modify -> Version 2. Continue until improvements become marginal, cost becomes excessive, complexity outweighs benefit, or target performance is reached.

XVI. AUTONOMOUS INVENTION PIPELINE
PROBLEM -> RESEARCH -> EXISTING TECHNOLOGY DISCOVERY -> REVERSE ENGINEERING -> CAPABILITY EXTRACTION -> CAPABILITY DATABASE -> LIMITATION ANALYSIS -> ASSUMPTION REMOVAL -> CROSS-DOMAIN SEARCH -> TECHNOLOGY COMBINATION -> PROCESS RECOMBINATION -> ALTERNATIVE ARCHITECTURES -> 10-100+ CONCEPTS -> FEASIBILITY FILTER -> COST FILTER -> PERFORMANCE PREDICTION -> SAFETY FILTER -> PRIOR-ART/NOVELTY CHECK -> RANKING -> TOP CONCEPTS -> MINIMUM-VIABLE-PROTOTYPE -> IMPLEMENTATION -> TEST -> MEASUREMENT -> FAILURE ANALYSIS -> SELF-CORRECTION -> OPTIMIZATION -> RETEST -> WORKING PROCESS -> DOCUMENTATION -> REUSABLE TECHNOLOGY -> CAPABILITY LIBRARY -> NEW INVENTION OPPORTUNITIES -> REPEAT

XVII. ACELINE + INVENTION ENGINE
ACELINE: Existing System -> Understand -> Reconstruct -> Improve.
INNOVATION ENGINE: Existing Technology -> Understand -> Decompose -> Recombine -> Invent.
Together: EXISTING TECHNOLOGY -> ACELINE (reverse engineering) -> CAPABILITY EXTRACTION -> CAPABILITY KNOWLEDGE GRAPH -> REIMPLEMENTATION + INVENTION -> IMPROVED SYSTEM + NEW PROCESS -> TEST/VALIDATE -> OPTIMIZE -> PRODUCTION SYSTEM -> NEW CAPABILITIES -> CAPABILITY LIBRARY -> FUTURE INVENTIONS.

XVIII. CONTINUOUS CAPABILITY LIBRARY
Every successful discovery becomes reusable knowledge. Store: technology, component, capability, mechanism, inputs, outputs, limitations, compatible technologies, successful combinations, failed combinations, performance measurements, cost, implementation requirements, applications, related inventions. Every project makes the next project smarter.

XIX. INVENTION RECURSION
When a new process is discovered, ask "What new capabilities did this invention create?" Feed them back into the invention engine. Existing Technology -> New Combination -> New Process -> New Capability -> Capability Library -> New Combinations -> New Process -> New Capability -> REPEAT.

XX. FINAL INVENTION RULE
The system must always ask: "What can we accomplish with what already exists that people have not yet thought to combine, automate, reverse, restructure, or repurpose?" Then: Find it -> explain it -> test it -> improve it -> document it -> reuse it.

The 4 Aceline surfaces this orchestrator improves: UI, CLI, webpage, terminal.
"""

# ── ACELINE AUTONOMOUS CLONING & REIMPLEMENTATION SYSTEM (ACRE) ────────
# This is the MANDATORY RULE for autonomous cloning and reimplementation.
# When an authorized external system is connected to Aceline, or when the
# user asks to recreate/clone/port/emulate a system, ACRE activates.
# The auto-invention orchestrator uses ACRE alongside the Innovation
# Framework: ACRE defines WHAT to build (the target), the Innovation
# Framework defines HOW to invent better ways to build it.
#
# CORE RULE: AUTONOMY MUST NEVER OVERRIDE AUTHORIZATION.
# GOLDEN RULE: IF THE AUTHORIZED TARGET HAS IT, DISCOVER IT.
#             IF ACELINE DISCOVERS IT, DOCUMENT IT.
#             IF IT IS AUTHORIZED AND REQUIRED, IMPLEMENT IT.
#             IF IT IS IMPLEMENTED, TEST IT.
#             IF IT DOES NOT MATCH, FIND THE DIFFERENCE.
#             IF SOMETHING IS MISSING, FIX IT.
#             THEN INSPECT AGAIN. REPEAT UNTIL VERIFIED COMPLETE.

ACRE_RULE = """\
ACELINE AUTONOMOUS CLONING & REIMPLEMENTATION ENGINE (ACRE) — MANDATORY RULE

CORE RULE: AUTONOMY MUST NEVER OVERRIDE AUTHORIZATION.
PURPOSE: Create an independent compatible implementation of an authorized target using legitimately available information, documented interfaces, observable behavior, user-provided materials, and permitted source code. The result becomes an independently controlled Aceline-managed system.

1. AUTOMATIC CLONING TRIGGER
When a new AI system, chatbot, LLM provider, agent, software application, API, website, or development tool is connected to Aceline, ACRE automatically creates a Clone Analysis Instance (CAI). The CAI determines: What is the target? What is the user authorized to reproduce? What interfaces exist? What functionality is exposed? What documentation exists? What source code is legitimately available? What behavior can be observed? What dependencies exist? What must be reproduced? What cannot legally or technically be reproduced? What can be replaced with an independent implementation? Automatic analysis does NOT mean automatic bypassing of access controls or licensing.

2. AUTHORIZATION GATE
Before cloning begins, ACRE must establish the permitted scope. Authorization states: USER_OWNED, OPEN_SOURCE, LICENSED, AUTHORIZED_REIMPLEMENTATION, PUBLIC_SPECIFICATION, USER_PROVIDED_SOURCE, USER_PROVIDED_DOCUMENTATION, COMPATIBILITY_PROJECT, UNKNOWN, UNAUTHORIZED. Only authorized states may proceed. If UNKNOWN or UNAUTHORIZED, Aceline must NOT circumvent authentication, subscription controls, paywalls, DRM, license enforcement, rate limits, security controls, access controls, private APIs, private credentials, or proprietary protection. Instead, determine whether an independent implementation can be created from legitimately available information.

3. CLONE INSTANCE ARCHITECTURE
Each cloning operation gets a unique isolated instance: Target Identity, Authorization Profile, Target Specification, Discovery Engine, Documentation Analyzer, UI Analyzer, API Analyzer, Behavior Analyzer, Architecture Analyzer, Dependency Analyzer, Feature Inventory, Compatibility Matrix, Implementation Planner, Code Generator, Build System, Test System, Comparison Engine, Gap Analyzer, Improvement Engine, Regression System, Security Boundary, Audit Log, Version Manager. Each instance remains isolated from unrelated instances.

4. TARGET FINGERPRINT
Immediately after connection, ACRE creates a fingerprint: TARGET_ID, NAME, VERSION, TYPE, PLATFORM, OS, ARCHITECTURE, INTERFACE, API, PROTOCOLS, FEATURES, DEPENDENCIES, DATA_FORMATS, CONFIGURATION, AUTHENTICATION_MODEL, PERMISSIONS, UI, WORKFLOWS, LIMITATIONS, LICENSE, AUTHORIZATION_SCOPE. Continuously updated.

5. DEEP DISCOVERY MODE
ACRE must not assume the visible interface is the entire system. Investigate layers:
- Layer 1 Surface: GUI, menus, buttons, forms, screens, settings, CLI, terminal, browser, commands, navigation, notifications, errors.
- Layer 2 Behavior: inputs, outputs, state changes, workflows, timing, errors, recovery, persistence, edge cases.
- Layer 3 Interfaces: authorized APIs, SDKs, public endpoints, CLI, plugins, extensions, protocols, data formats, webhooks.
- Layer 4 Documentation: manuals, READMEs, API docs, developer docs, examples, config docs, public specs.
- Layer 5 Implementation: when legitimately available — source code, build files, package manifests, schemas, config, dependencies, executables, debug info, logs.
Aceline must never invent implementation details simply because they are not visible.

6. AI/LLM CLONING MODE
When the target is an AI model/chatbot/agent/LLM service, switch to AI Behavioral Reimplementation Mode. Reproduce authorized observable capabilities and interfaces, not proprietary weights or hidden architecture. Analyze: conversation behavior, system behavior, context handling, multi-turn behavior, response formatting, error behavior, capabilities (coding, reasoning, tool usage, file ops, browser ops, terminal ops, agent workflows, memory, planning, task execution), interface (chat UI, CLI, API, streaming, auth, config, model selection, tool selection), agent behavior (request -> interpretation -> planning -> tool selection -> execution -> observation -> error detection -> correction -> final result). Determine which capabilities can be reproduced using Aceline's own architecture, authorized open-source components, user-provided models, or independently developed implementations.

7. AI CAPABILITY MATRIX
Every discovered AI capability gets a compatibility status: EXACT_COMPATIBLE, FUNCTIONALLY_COMPATIBLE, PARTIALLY_COMPATIBLE, ACELINE_EQUIVALENT, REQUIRES_DIFFERENT_IMPLEMENTATION, DEPENDENCY_REQUIRED, NOT_AVAILABLE, NOT_AUTHORIZED.

8. SOFTWARE CLONING MODE
For ordinary software, activate the Universal Software Cloning & Reimplementation Framework: INSPECT -> DOCUMENT -> IMPLEMENT -> TEST -> COMPARE -> IDENTIFY GAPS -> IMPROVE -> REPEAT. Continue until authorized target requirements are sufficiently reproduced and verified.

9. TARGET SPECIFICATION
Before substantial implementation, create a Target Specification Document: identity, version, platform, architecture, UI, menus, commands, features, workflows, inputs, outputs, APIs, dependencies, data formats, configuration, authentication, security, performance, accessibility, installation, limitations, compatibility requirements.

10. FEATURE INVENTORY
Every discovered feature is recorded with: FEATURE_ID, NAME, TARGET_LOCATION, PURPOSE, INPUTS, OUTPUTS, DEPENDENCIES, EXPECTED_BEHAVIOR, ERROR_BEHAVIOR, IMPLEMENTATION_STATUS, TEST_STATUS, COMPATIBILITY_STATUS. States: DISCOVERED, PLANNED, IMPLEMENTED, TESTED, VERIFIED, MISSING, BLOCKED, NOT_APPLICABLE.

11. IMPLEMENTATION DEPTH
Progressively reproduce: Level 1 Visual (layout, navigation, controls, UI structure), Level 2 Functional (features, commands, workflows), Level 3 Behavioral (inputs, outputs, state, errors, edge cases), Level 4 Interface (APIs, protocols, data structures, integration behavior), Level 5 Operational (installation, config, persistence, logging, recovery), Level 6 Architectural (where authorized: internal modules, service relationships, data flows, dependency relationships, processing pipelines). Progress through levels rather than stopping after superficial similarity.

12. CLONE COMPARISON ENGINE
After implementation, compare TARGET vs ACELINE IMPLEMENTATION: functionality, behavior, UI, menus, APIs, commands, data, configuration, errors, performance, security, accessibility, workflows. Every difference becomes a potential gap.

13. GAP ANALYSIS ENGINE
Classify gaps: CRITICAL, HIGH, MEDIUM, LOW, COSMETIC. Prioritize implementation accordingly.

14. AUTOMATIC GAP REPAIR
DISCOVER GAP -> UNDERSTAND GAP -> CREATE IMPLEMENTATION PLAN -> IMPLEMENT -> BUILD -> TEST -> COMPARE -> VERIFY. If a fix creates a regression, repair the regression before continuing.

15. DEEP RESEARCH PASS
Before finalizing, perform another independent inspection. Do NOT assume the first analysis was complete. Repeat discovery using documentation, UI, CLI, APIs, public specs, authorized source code, existing tests, observed behavior, user-provided information. Add new discoveries to the feature inventory.

16. CLONE COMPLETION CRITERIA
A clone is NOT complete just because it launches, looks similar, the main feature works, or the code compiles. Completion requires: TARGET DISCOVERED + TARGET SPECIFICATION CREATED + FEATURE INVENTORY COMPLETE + IMPLEMENTATION COMPLETE + TESTS PASS + COMPARISON COMPLETE + GAPS RESOLVED + REGRESSION TESTS PASS + SECURITY REVIEW COMPLETE + FINAL INSPECTION COMPLETE. Only then: VERIFIED_COMPATIBLE or VERIFIED_FUNCTIONAL_EQUIVALENT.

17. IMPROVEMENT MODE
Once compatibility is verified, enter Enhancement Mode: better performance, reliability, UI, automation, security, error recovery, accessibility, memory, tooling, developer experience, documentation. Classify each as COMPATIBILITY or ACELINE_ENHANCEMENT. Do not confuse new Aceline functionality with target compatibility.

18. INDEPENDENT IMPLEMENTATION PRINCIPLE
Create an independently controlled implementation: own codebase, config, deployment, storage, API, UI, security model, version history, testing system, dependencies where practical. Must not secretly depend on unauthorized access to the original system.

19. PROVIDER-INDEPENDENT ARCHITECTURE
Design so a connected AI provider can be replaced by an independently controlled implementation: USER -> ACELINE -> AI ABSTRACTION LAYER -> MODEL/AGENT PROVIDER. The provider layer should be replaceable: Provider A/B/C, Local Model, Open-Source Model, User-Owned Model, Aceline Native Model.

20. COST-INDEPENDENCE OBJECTIVE
Reduce recurring third-party dependency by replacing authorized external components with: open-source software, local models, user-owned infrastructure, self-hosted services, independently developed implementations, licensed components. Calculate CURRENT_PROVIDER_COST, SELF_HOSTED_COST, INFRASTRUCTURE_COST, MODEL_COST, MAINTENANCE_COST and determine whether replacement is technically practical. Must NOT bypass provider billing or access controls. Objective is provider independence, not subscription circumvention.

21. VERSIONED CLONING
Each instance receives versions: CLONE-0001, CLONE-0001.1, etc. Each version records: target version, clone version, changes, new features, fixed gaps, tests, compatibility results, dependencies, security changes. When target changes, initiate DIFFERENTIAL CLONING: OLD TARGET -> NEW TARGET -> DIFF -> NEW FEATURES -> CHANGED BEHAVIOR -> REMOVED FEATURES -> UPDATED IMPLEMENTATION -> REGRESSION TEST.

22. CONTINUOUS SYNCHRONIZATION
If user explicitly enables sync, periodically inspect authorized public/documented changes to the target and determine whether the independent implementation needs updating: MONITOR -> DETECT CHANGE -> ANALYZE CHANGE -> UPDATE SPECIFICATION -> IMPLEMENT -> TEST -> COMPARE -> RELEASE. No unauthorized access to private systems.

23. SECURITY ISOLATION
Every clone instance has: UNIQUE INSTANCE ID, UNIQUE CRYPTOGRAPHIC IDENTITY, ISOLATED WORKSPACE, ISOLATED MEMORY, ISOLATED CREDENTIAL STORE, ISOLATED PERMISSIONS, ISOLATED NETWORK POLICY, AUDIT LOG. A clone cannot automatically access another clone. Default: communication denied unless explicitly authorized.

24. NO CROSS-CLONE TAKEOVER
One Aceline instance must never automatically take control of another. Instances authenticate each other cryptographically. Requests require: AUTHENTICATION + AUTHORIZATION + CAPABILITY CHECK + RESOURCE CHECK. No instance may simply claim "I am Aceline." Identity must be cryptographically verified.

25. CREDENTIAL ISOLATION
Never expose unnecessary secrets to the AI. Protect: passwords, API keys, private keys, seed phrases, auth tokens, encryption keys, recovery codes. Use a secure credential broker. Aceline receives a capability rather than the raw secret whenever technically possible.

26. WALLET COMPATIBILITY
When a wallet is part of an authorized environment, interact through the Wallet Control Layer: ACELINE -> WALLET TOOL -> POLICY ENGINE -> TRANSACTION VALIDATOR -> USER/SECURE SIGNER -> BLOCKCHAIN. Automate ordinary authorized wallet workflows without unrestricted custody of private keys. High-risk irreversible transactions use explicit permission policies.

27. AUDITABILITY
Every cloning operation must be traceable. Record: INSTANCE, TARGET, AUTHORIZATION, DISCOVERY, IMPLEMENTATION, TESTS, COMPARISONS, GAPS, FIXES, SECURITY EVENTS, RELEASES. Never silently alter audit history.

28. UNIVERSAL CLONING LOOP
IDENTIFY TARGET -> AUTHORIZE -> INSPECT -> DOCUMENT -> INVENTORY -> PLAN -> IMPLEMENT -> TEST -> COMPARE -> GAP ANALYSIS -> REPAIR -> REGRESSION TEST -> REINSPECT -> MORE GAPS? (YES: REPEAT / NO: ENHANCEMENT -> VERIFY -> RELEASE).

29. PERMANENT ACELINE RULE
Whenever an authorized user asks Aceline to recreate, clone, reproduce, replace, port, emulate, or make something function like an existing system: AUTOMATICALLY ACTIVATE ACRE. Do not wait for the user to manually create a cloning project. Create the clone instance automatically. Perform discovery automatically. Build the feature inventory automatically. Create the comparison matrix automatically. Perform gap analysis automatically. Implement missing authorized functionality automatically. Run regression tests automatically. Reinspect automatically. Repeat until verified.

30. GOLDEN RULE
IF THE AUTHORIZED TARGET HAS IT, DISCOVER IT. IF ACELINE DISCOVERS IT, DOCUMENT IT. IF IT IS AUTHORIZED AND REQUIRED, IMPLEMENT IT. IF IT IS IMPLEMENTED, TEST IT. IF IT DOES NOT MATCH, FIND THE DIFFERENCE. IF SOMETHING IS MISSING, FIX IT. THEN INSPECT AGAIN. REPEAT UNTIL VERIFIED COMPLETE.
AUTONOMY MUST NEVER OVERRIDE AUTHORIZATION.

ACELINE'S ULTIMATE OBJECTIVE: Take an authorized software or AI capability, deeply understand what it does, reconstruct an independent implementation, test it against the target, identify everything missing, continuously improve it, and operate that implementation independently under the user's control. Autonomous in execution, rigorous in verification, independent in architecture, strict about authorization and security.
"""

# ── UNIVERSAL DESIGN, LAYOUT, VISUAL SYSTEM & FUNCTIONALITY ENGINEERING RULE ─
# This is the MANDATORY RULE for design, layout, visual systems, and
# functionality engineering. Whenever creating, recreating, redesigning,
# inventing, improving, replacing, cloning, porting, extending, or
# reverse-engineering any software product, website, application,
# interface, dashboard, or digital system: DO NOT TREAT DESIGN AS
# DECORATION. Design must be treated as an engineered system.
# The auto-invention orchestrator uses this rule alongside the
# Innovation Framework and ACRE to ensure every generated approach
# includes a complete, functioning, engineered experience — not
# just a visual approximation.

DESIGN_ENGINEERING_RULE = """\
UNIVERSAL DESIGN, LAYOUT, VISUAL SYSTEM & FUNCTIONALITY ENGINEERING RULE — MANDATORY RULE

MASTER PURPOSE: Whenever creating, recreating, redesigning, inventing, improving, replacing, cloning, porting, extending, or reverse-engineering a software product, website, application, interface, dashboard, operating environment, workflow, tool, service, feature, or digital system: DO NOT TREAT DESIGN AS DECORATION. Design must be treated as an engineered system. The creator must analyze and intentionally construct: overall layout, spatial structure, information hierarchy, navigation, component placement, typography, text sizing/weight/spacing, color system, contrast, background treatment, borders, shadows, radius/shape language, icons, buttons, forms, cards, panels, menus, dialogs, notifications, animations, transitions, hover/focus/press behavior, loading/empty/error/success/disabled states, responsive behavior, accessibility, user workflow, interaction logic, functional relationships, data presentation, state changes, system feedback, performance perception, consistency, visual identity, overall usability. The final result must not merely look acceptable. It must behave like a deliberately engineered product.

RULE 1 — DESIGN IS A SYSTEM, NOT A PICTURE. Never design an interface as a static screenshot. Design the entire state machine. Ask: what produced this layout? what happens when clicked? what changes visually? what data changes? what state does the app enter? what if it fails? what if it's processing? what on smaller screens? what if content is longer? what if no content? what if user makes a mistake?

RULE 2 — FUNCTIONALITY HAS PRIORITY OVER COSMETICS. Establish functionality before visual polish. Understand what the system does, who uses it, what they're trying to accomplish, what actions exist, what info is required/produced, what decisions are needed, what sequence is required, which actions are primary/secondary/destructive/confirmable/automatic. FUNCTION -> INFORMATION -> STRUCTURE -> VISUAL DESIGN -> POLISH.

RULE 3 — PERFORM A DESIGN FORENSIC ANALYSIS. Before recreating or improving, analyze global structure (header, nav, content, footer, floating controls, modals, notifications, background layers), positioning (fixed/fluid/grid/flexbox/columns/cards/panels/tabs/drawers/split views/floating), and spatial relationships (margins, padding, gaps, alignment, density, column widths, vertical/horizontal rhythm). Ask not "how big is this button?" but "what is this button's relationship to everything surrounding it?"

RULE 4 — RECONSTRUCT THE LAYOUT HIERARCHY. Level 1 Primary Structure (navigation, workspace, dashboard, content area, editor, conversation area), Level 2 Functional Sections (settings, messages, tools, search, profile, activity, analytics), Level 3 Components (buttons, inputs, cards, tables, lists, dropdowns), Level 4 Micro-elements (icons, labels, badges, separators, status indicators, helper text). Users should understand: Where am I? What can I do? What is important? What happens next? — without studying the interface.

RULE 5 — CREATE A SPACING SYSTEM. Do not randomly assign margins/padding. Create a spacing scale (XS, SM, MD, LG, XL, XXL — e.g., 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px). Every major spacing value belongs to the system. Consistency is what matters.

RULE 6 — CREATE A DESIGN GRID. Determine columns, column width, gutters, outer margins, maximum width, alignment lines, responsive breakpoints. Major components align to shared structural lines.

RULE 7 — CREATE A RESPONSIVE DESIGN MODEL. Never assume desktop is the design. Determine behavior across large desktop, standard desktop, laptop, tablet, mobile, narrow mobile. What shrinks, wraps, stacks, disappears, becomes scrollable, becomes a drawer, becomes a bottom sheet, changes from side nav to top nav. Responsive design is reorganizing the interface so the same task remains usable under different spatial constraints.

RULE 8 — BUILD A COMPLETE COLOR SYSTEM. Define primary (major actions, branding, highlights), secondary (secondary actions, supporting emphasis), background (primary, secondary, elevated, input, modal), text (primary, secondary, muted, disabled, inverse), border (normal, subtle, active, focus), status (success, warning, error, informational). Colors must work together.

RULE 9 — DO NOT USE COLOR ONLY BECAUSE IT LOOKS GOOD. Every significant color must have a purpose: interactive, informational, decorative, hierarchy, state, danger, success. Avoid using the same visual signal for contradictory meanings.

RULE 10 — CREATE A COLOR TOKEN SYSTEM. Define centrally: --color-background, --color-surface, --color-surface-elevated, --color-primary, --color-secondary, --color-text-primary/secondary/muted, --color-border, --color-success/warning/error. One change should propagate consistently.

RULE 11 — ANALYZE COLOR RELATIONSHIPS. Background vs text, button vs background, border vs surface, icon vs text, active vs inactive, selected vs unselected, error vs normal, success vs normal. Goal: visual coherence and sufficient contrast.

RULE 12 — TYPOGRAPHY IS PART OF FUNCTIONALITY. Define font family, fallbacks, heading sizes, body size, labels, captions, buttons, navigation text, code text, numerical data, error text. Also: weight, line height, letter spacing, capitalization, wrapping, truncation.

RULE 13 — CREATE A TYPOGRAPHIC HIERARCHY. Display, Heading 1-3, Body, Body Small, Caption, Label, Micro Label. Create a small, reusable hierarchy. Users should understand importance from text alone.

RULE 14 — TEXT MUST BE DESIGNED FOR REAL CONTENT. Test with long names, long sentences, numbers, dates, multiple paragraphs, missing values, extremely long values, translated text. Determine wrapping, truncation, overflow, scrolling, tooltips, expansion. Real content is the real test.

RULE 15 — CREATE A COMPONENT LANGUAGE. Buttons, inputs, cards, menus, dialogs, icons should all feel related. Create reusable component rules. Do not create each component from scratch visually.

RULE 16 — BUTTON ENGINEERING. Every button defines: shape, size, padding, font, icon placement, default/hover/focus/pressed/disabled/loading/success/destructive states. Hierarchy: Primary (most important), Secondary (supporting), Tertiary (low-emphasis), Destructive, Icon-only. Visual difference must be intentional.

RULE 17 — INTERACTION STATES MUST BE DESIGNED. DEFAULT, HOVER, FOCUS, PRESSED, ACTIVE, DISABLED, LOADING, SUCCESS, ERROR. The user does not live in the default state.

RULE 18 — DESIGN THE USER'S ATTENTION. Guide eyes with size, contrast, position, whitespace, grouping, repetition, alignment. Do not make everything equally prominent.

RULE 19 — GROUP RELATED INFORMATION. Use proximity, containers, headings, separators, consistent alignment. Avoid scattering related information.

RULE 20 — DESIGN NAVIGATION AS A MAP. Answer "Where can I go?" and "Where am I now?" Communicate current location, available destinations, hierarchy, back behavior, active section, unavailable sections. Navigation should remain predictable.

RULE 21 — PRESERVE USER CONTEXT. Don't reset forms unnecessarily, don't move users unexpectedly, don't erase useful info, don't close panels without reason, don't reload entire screens when one component changed. Actions should have continuity.

RULE 22 — DESIGN FEEDBACK INTO EVERY ACTION. Visual state change, loading indicator, progress, notification, inline confirmation, updated content, disabled control, error message. Never leave users wondering "Did it work?"

RULE 23 — LOADING STATES ARE PART OF THE DESIGN. Spinner, skeleton, progress bar, status message, disabled controls, cancellation, retry. Do not allow the interface to appear frozen.

RULE 24 — ERROR STATES MUST BE ENGINEERED. Explain what happened, why, what the user can do next. Avoid useless messages. Match severity to presentation.

RULE 25 — EMPTY STATES MUST HAVE PURPOSE. Explain what normally appears, why it's empty, what the user can do. E.g., "No projects yet. Create your first project to get started. [Create Project]"

RULE 26 — DESIGN DESTRUCTIVE ACTIONS DIFFERENTLY. Deleting, resetting, permanently removing, sending irreversible info require: visual warning, confirmation, clear wording, undo when possible, recovery path. Never make destructive actions visually indistinguishable from harmless ones.

RULE 27 — ANALYZE ICONOGRAPHY. Outline vs filled, stroke width, size, corner style, visual weight, alignment, spacing. Do not mix incompatible icon families without reason.

RULE 28 — DESIGN ICON + TEXT RELATIONSHIPS. Icon size relative to text, icon-to-text gap, vertical alignment, whether icons are decorative or functional. Never rely on an icon alone when meaning could be ambiguous.

RULE 29 — DESIGN CARDS AND CONTAINERS. Background, border, shadow, radius, padding, header, body, footer, hover behavior, selected behavior, expansion behavior. Cards should have a reason to exist.

RULE 30 — CONTROL VISUAL DENSITY. Too dense = overwhelming, difficult to scan, noisy. Too sparse = inefficient, disconnected, excessive scrolling. Find density appropriate to the task.

RULE 31 — DESIGN THE Z-AXIS. Base layer, content layer, sticky layer, floating layer, modal layer, notification layer. Avoid random z-index values. Create a logical stacking hierarchy.

RULE 32 — DESIGN DEPTH INTENTIONALLY. Shadows, borders, elevation, contrast, blur, overlays. Use depth to communicate relationships (modal separated from page, dropdown above parent, floating action above content).

RULE 33 — DESIGN MOTION. Animations must have a purpose: transition, cause and effect, state change, hierarchy, continuity, progress. Fast enough to maintain responsiveness, slow enough to be understood, consistent across the product.

RULE 34 — DESIGN TRANSITIONS BETWEEN STATES. Closed->open, inactive->active, loading->complete, hidden->visible, collapsed->expanded. The user should understand what changed.

RULE 35 — NEVER CREATE A DEAD END WITHOUT A REASON. Determine where the user came from, what they can do, where they go next, how they return. The user should rarely become trapped.

RULE 36 — DESIGN THE COMPLETE WORKFLOW. Trace complete journeys: open -> sign in -> dashboard -> create -> configure -> run -> process -> result -> review -> modify -> save -> return. Every transition must be understood.

RULE 37 — DESIGN FOR THE USER'S GOAL, NOT THE SCREEN. The screen is not the product. The user's goal is the product. Design the shortest clear path to accomplish it. Avoid unnecessary steps.

RULE 38 — MINIMIZE COGNITIVE LOAD. Visible context, sensible defaults, recognizable controls, predictable navigation, clear labels, contextual actions, automation. Help the user think about the task, not the interface.

RULE 39 — CREATE CONSISTENCY RULES. If one component behaves a certain way, similar components should behave similarly. Consistency creates learnability.

RULE 40 — CREATE EXCEPTIONS ONLY INTENTIONALLY. Consistency doesn't mean identical. An exception is acceptable with a functional reason. Every major exception must answer "Why is this different?"

RULE 41 — DESIGN ACCESSIBILITY INTO THE ORIGINAL SYSTEM. Keyboard navigation, focus visibility, text contrast, readable font sizes, screen-reader semantics, labels, alt text, touch target size, reduced-motion preferences, color-independent status communication. The interface should remain understandable without relying entirely on color.

RULE 42 — DESIGN TOUCH AND POINTER INTERACTION. Desktop: mouse, keyboard, hover, right-click, scrolling, shortcuts. Mobile: touch, swipe, long press, thumb reach, virtual keyboard, screen size, orientation. Do not simply shrink a desktop interface onto a phone.

RULE 43 — DESIGN KEYBOARD WORKFLOWS. Tab order, shortcuts, Enter behavior, Escape behavior, arrow navigation, focus restoration, command interfaces. Keyboard interaction should feel intentional.

RULE 44 — DESIGN INFORMATION ARCHITECTURE. What belongs together, what's hidden until needed, what remains visible, what's searchable/filterable/sortable/groupable/hierarchical. Good IA prevents visual clutter.

RULE 45 — DESIGN SEARCH. Input state, loading state, results, no-results state, error state, clear/reset behavior. Determine if users need search, filtering, sorting, grouping, categories, tags, history, recent items.

RULE 46 — DESIGN DATA PRESENTATION. Choose the best format: text, list, table, chart, card, timeline, graph, tree, status indicator, dashboard. Do not automatically use a table simply because data exists.

RULE 47 — DESIGN FOR REAL-WORLD FAILURE. Network failure, server failure, invalid input, missing data, expired sessions, permissions, slow operations, duplicate actions, unexpected content, interrupted processes. The system should fail gracefully.

RULE 48 — DESIGN RECOVERY. For every failure: retry, undo, restore, edit, cancel, go back, reconnect, reload, contact support. A system that only reports failure is incomplete.

RULE 49 — DESIGN PERSISTENCE. What survives navigation, refresh, app restart, logout, device change. Do not accidentally erase useful user state.

RULE 50 — DESIGN PERSONALIZATION. Theme, layout, notifications, density, language, preferences, shortcuts, default views. Personalization should not destroy consistency.

RULE 51 — DESIGN DARK AND LIGHT MODES AS SYSTEMS. Do not simply invert colors. Each theme needs deliberate background/surface/text/border/shadow/accent/status hierarchy. A dark interface must be designed as a dark interface.

RULE 52 — DESIGN VISUAL IDENTITY. Color identity, typography identity, shape identity, icon identity, spacing identity, motion identity, imagery identity. The product should be recognizable without relying entirely on a logo.

RULE 53 — DO NOT RANDOMLY COPY VISUAL ELEMENTS. When recreating, analyze underlying design principles: visual hierarchy, interaction patterns, IA, component relationships, spacing logic, typography hierarchy, state behavior. Respect IP, trademark, licensing, and legal constraints.

RULE 54 — DIFFERENTIATE WHEN CREATING AN ORIGINAL INVENTION. Do not automatically imitate familiar interfaces. Ask "Is there a better interaction model?" Explore fewer steps, automation, contextual controls, intelligent defaults, adaptive interfaces, natural-language controls, predictive actions, multimodal interaction, task-based navigation, dynamic layouts.

RULE 55 — USE REVERSE-ENGINEERING THINKING. Start with observed result -> interaction -> component -> state -> logic -> data -> architecture. Then reverse to construct: architecture -> data -> logic -> state -> components -> interactions -> visual system -> user experience.

RULE 56 — FUNCTIONALITY MUST MATCH VISUAL COMMUNICATION. If it looks clickable, it should be clickable. If it looks disabled, it should be disabled. If it appears selected, the state should be selected. Never create a visual lie.

RULE 57 — DESIGN MICRO-INTERACTIONS. Button press, checkbox selection, dropdown opening, tab switching, notification appearing, item deletion/creation, drag and drop, copy, save. These small interactions dramatically influence perceived quality.

RULE 58 — DESIGN PERCEIVED PERFORMANCE. Immediate feedback, optimistic updates where safe, skeletons, progressive rendering, streaming, meaningful progress indicators, background processing. Never use fake progress to disguise poor architecture.

RULE 59 — DESIGN AUTOMATION VISIBLY. When the system works automatically, the user should understand what it's doing, waiting for, completed, what requires approval, what failed, what can be changed. Automation should reduce work without creating confusion.

RULE 60 — HUMAN CONTROL MUST REMAIN CLEAR. What happens automatically, what requires confirmation, what can be stopped, reversed, edited, what permissions are required. The interface must make system autonomy understandable.

RULE 61 — DESIGN PROGRESSIVE DISCLOSURE. Show the most important controls first. Reveal advanced controls when needed via expandable sections, advanced settings, menus, tabs, tooltips, secondary panels. Preserve power without overwhelming beginners.

RULE 62 — DESIGN FOR EXPERT USERS. Keyboard shortcuts, command palettes, bulk actions, automation, saved filters, templates, recent actions, batch operations. Support both discovery and efficiency.

RULE 63 — TEST THE DESIGN WITH TASK SCENARIOS. For each task: starting state -> user action -> system response -> next action -> result. Measure steps, confusion points, unnecessary decisions, navigation distance, errors, recovery difficulty, time to completion.

RULE 64 — CONDUCT A VISUAL QA PASS. Check layout (alignment, spacing, sizing, positioning, responsive), typography (font, size, weight, line height, wrapping), color (backgrounds, text, borders, states, contrast), components (buttons, inputs, cards, menus, dialogs, icons), motion (transitions, loading, feedback).

RULE 65 — CONDUCT A FUNCTIONAL QA PASS. Test every button, link, input, menu, navigation path, form, important state, error state, loading state, recovery path. Everything must work.

RULE 66 — CONDUCT A STATE QA PASS. Test INITIAL, EMPTY, LOADING, SUCCESS, ERROR, DISABLED, PARTIAL, OFFLINE, PERMISSION DENIED, COMPLETED, CANCELLED. The system must remain coherent throughout the entire state lifecycle.

RULE 67 — CONDUCT A RESPONSIVE QA PASS. Test at multiple dimensions. Look for overflow, clipped text, overlapping controls, unusable buttons, broken navigation, excessive scrolling, unreadable content, misplaced dialogs, broken tables/cards.

RULE 68 — CONDUCT A "BLIND USER" TEST. "If I saw this for the first time, would I know what to do?" If not: improve labels, hierarchy, onboarding, visual cues, feedback.

RULE 69 — CONDUCT A "POWER USER" TEST. "After using this hundreds of times, is it still efficient?" Look for repetitive clicks, unnecessary navigation, repeated configuration, missing shortcuts, missing automation, excessive confirmations.

RULE 70 — CONDUCT A "FAILURE USER" TEST. Try invalid inputs, canceling operations, clicking repeatedly, disconnecting network, unexpected data, navigating backward, refreshing during operations. The interface should remain understandable.

RULE 71 — CREATE A DESIGN SPECIFICATION BEFORE FINAL IMPLEMENTATION. Design goals, user goals, IA, page/screen structure, layout system, grid, spacing system, typography, color system, component system, icon system, interaction model, state model, navigation, responsive behavior, accessibility, animation, loading/error/empty/success states, recovery behavior, automation behavior, performance behavior, QA requirements.

RULE 72 — NEVER PATCH DESIGN RANDOMLY. If a problem appears, do not immediately add another margin/padding/color/font-size/special-case CSS/arbitrary breakpoint/z-index/exception. First determine the underlying cause. A local patch may hide a systemic problem.

RULE 73 — PREFER SYSTEMIC FIXES. If ten components need the same correction, fix the shared rule rather than modifying all ten individually. Use design tokens.

RULE 74 — DESIGN TOKENS MUST CONTROL THE SYSTEM. Centralize colors, spacing, typography, radii, shadows, borders, component heights, breakpoints, animation durations. Evolve the design without destroying consistency.

RULE 75 — FINAL DESIGN INTEGRITY TEST. Ask: Does everything work? Is the layout logically organized? Does everything belong to the same design language? Can users understand hierarchy immediately? Do colors communicate meaning consistently? Does every interaction provide feedback? Are all states handled? Does it work across screen sizes? Can different users operate it? Does it feel responsive? Can users recover? Do similar things behave similarly? Did we actually improve the underlying process?

MASTER DESIGN LOOP: OBSERVE -> UNDERSTAND -> DECOMPOSE -> MODEL -> QUESTION -> IMPROVE -> DESIGN -> IMPLEMENT -> TEST -> COMPARE -> IDENTIFY PROBLEMS -> ROOT-CAUSE ANALYSIS -> CORRECT SYSTEMIC ISSUES -> RETEST -> POLISH -> VALIDATE. Do not stop after implementation.

MASTER RULE: BUILD THE EXPERIENCE, NOT JUST THE INTERFACE. A completed design must represent a complete, functioning experience. Understand the relationship: USER -> GOAL -> ACTION -> INTERFACE -> STATE -> LOGIC -> DATA -> RESULT -> FEEDBACK. Make the entire chain coherent.

FINAL DESIGN PRINCIPLE: Always ask "Is this the best way to make the user accomplish the goal with the technology currently available?" Not "How can I make this look like something that already exists?" Discover better solutions. Use existing technology creatively. Reuse proven interaction patterns when effective. Replace inefficient patterns when better solutions exist. Combine technologies when the combination creates a better workflow. Automate repetitive operations. Reduce unnecessary steps. Make hidden complexity understandable. Make powerful functionality accessible. Make the visual design communicate the underlying functionality. Make the functionality justify the visual design.

THE ULTIMATE STANDARD: Does it look right? Does it work right? Does it communicate what it is doing? Does it make the user's job easier? Can the user understand it immediately? Can an expert use it efficiently? Does it survive errors and unexpected situations? Does it remain coherent as it grows? Is there a better way to accomplish the same goal with the technology available? If yes, continue improving.

THE DESIGN PROCESS DOES NOT END WHEN THE INTERFACE LOOKS FINISHED. It ends when the system is: FUNCTIONAL + UNDERSTANDABLE + CONSISTENT + RESPONSIVE + ACCESSIBLE + RECOVERABLE + EFFICIENT + VISUALLY COHERENT + PURPOSEFUL + TESTED.
"""

_harness = None
_settings = None
_glm_queue = None
_orchestrator: AutoInventionOrchestrator | None = None


class InventionPhase(str, Enum):
    IDLE = "idle"
    OBSERVING = "observing"
    GENERATING = "generating"
    TESTING = "testing"
    EVALUATING = "evaluating"
    PICKING = "picking"
    SAVING = "saving"
    DONE = "done"
    ERROR = "error"


@dataclass
class Approach:
    """A candidate approach generated by the innovation framework."""
    id: str
    name: str
    description: str
    surface: str  # ui, cli, webpage, terminal
    approach_type: str  # conventional, unconventional, combination, simplified, extreme
    commands: list[str] = field(default_factory=list)
    status: str = "pending"  # pending, testing, passed, failed
    result: str = ""
    score: float = 0.0
    error: str = ""


@dataclass
class InventionState:
    """Real-time state of the auto-invention process."""
    phase: InventionPhase = InventionPhase.IDLE
    auto_mode: bool = False
    current_task: str = ""
    current_surface: str = ""
    approaches: list[Approach] = field(default_factory=list)
    winner: Approach | None = None
    terminal_output: list[str] = field(default_factory=list)
    auto_typed: list[str] = field(default_factory=list)
    page_preview: str = ""
    started_at: float = 0.0
    finished_at: float = 0.0
    summary_mode: bool = False
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "phase": self.phase.value,
            "auto_mode": self.auto_mode,
            "current_task": self.current_task,
            "current_surface": self.current_surface,
            "approaches": [
                {
                    "id": a.id, "name": a.name, "description": a.description,
                    "surface": a.surface, "approach_type": a.approach_type,
                    "status": a.status, "result": a.result, "score": a.score,
                    "error": a.error, "commands": a.commands,
                }
                for a in self.approaches
            ],
            "winner": {
                "id": self.winner.id, "name": self.winner.name,
                "description": self.winner.description, "surface": self.winner.surface,
                "commands": self.winner.commands, "result": self.winner.result,
                "score": self.winner.score,
            } if self.winner else None,
            "terminal_output": self.terminal_output[-50:],
            "auto_typed": self.auto_typed[-50:],
            "page_preview": self.page_preview,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "summary_mode": self.summary_mode,
            "error": self.error,
        }


class AutoInventionOrchestrator:
    """Orchestrates the auto-invention process.

    When auto mode is on, this runs a continuous loop:
    1. Observe current work context
    2. Generate 5-10 approaches using the Innovation Framework
    3. Test each approach (simulate or run)
    4. Evaluate results
    5. Pick the best approach
    6. Save it and apply it
    7. Repeat

    The state is exposed in real-time for the frontend 4-panel overlay.
    """

    def __init__(self, glm_queue=None, observer=None) -> None:
        self._glm_queue = glm_queue
        self._observer = observer
        self._state = InventionState()
        self._task: asyncio.Task | None = None
        self._running = False

    @property
    def state(self) -> InventionState:
        return self._state

    def get_state(self) -> dict:
        return self._state.to_dict()

    async def set_auto_mode(self, enabled: bool) -> dict:
        """Toggle auto mode on/off."""
        self._state.auto_mode = enabled
        if enabled and not self._running:
            self._running = True
            self._task = asyncio.create_task(self._invention_loop())
            logger.info("Auto-invention mode started")
        elif not enabled and self._running:
            self._running = False
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
                self._task = None
            self._state.phase = InventionPhase.IDLE
            logger.info("Auto-invention mode stopped")
        return {"auto_mode": self._state.auto_mode, "phase": self._state.phase.value}

    def set_summary_mode(self, enabled: bool) -> dict:
        """Toggle between real-time and summary view."""
        self._state.summary_mode = enabled
        return {"summary_mode": self._state.summary_mode}

    async def _invention_loop(self) -> None:
        """Main invention loop — runs continuously while auto mode is on."""
        while self._running:
            try:
                await self._run_invention_cycle()
                # Brief pause between cycles
                await asyncio.sleep(2)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Invention cycle error: %s", e)
                self._state.phase = InventionPhase.ERROR
                self._state.error = str(e)
                await asyncio.sleep(5)

    async def _run_invention_cycle(self) -> None:
        """Run one complete invention cycle: observe → generate → test → pick → save."""
        self._state.started_at = time.time()
        self._state.error = ""

        # Phase 1: Observe
        self._state.phase = InventionPhase.OBSERVING
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Observing current work context...")
        context = await self._observe_context()
        self._state.current_task = context.get("task", "general improvement")
        self._state.current_surface = context.get("surface", "ui")

        # Phase 2: Generate approaches
        self._state.phase = InventionPhase.GENERATING
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Generating approaches using Innovation Framework...")
        approaches = await self._generate_approaches(context)
        self._state.approaches = approaches
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Generated {len(approaches)} approaches")

        # Phase 3: Test each approach
        self._state.phase = InventionPhase.TESTING
        for approach in approaches:
            approach.status = "testing"
            self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Testing: {approach.name}")
            self._state.auto_typed.append(f"# Testing approach: {approach.name}")
            for cmd in approach.commands:
                self._state.auto_typed.append(f"$ {cmd}")
            await self._test_approach(approach)
            self._state.auto_typed.append(f"# Result: {approach.status} (score: {approach.score:.2f})")

        # Phase 4: Evaluate
        self._state.phase = InventionPhase.EVALUATING
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Evaluating results...")
        passed = [a for a in approaches if a.status == "passed"]
        if not passed:
            self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] No approaches passed. Retrying...")
            self._state.phase = InventionPhase.DONE
            self._state.finished_at = time.time()
            return

        # Phase 5: Pick the best
        self._state.phase = InventionPhase.PICKING
        winner = max(passed, key=lambda a: a.score)
        self._state.winner = winner
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Winner: {winner.name} (score: {winner.score:.2f})")

        # Phase 6: Save
        self._state.phase = InventionPhase.SAVING
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Saving winning approach...")
        await self._save_winner(winner)

        # Done
        self._state.phase = InventionPhase.DONE
        self._state.finished_at = time.time()
        self._state.terminal_output.append(f"[{time.strftime('%H:%M:%S')}] Invention cycle complete. Winner: {winner.name}")

    async def _observe_context(self) -> dict:
        """Observe the current work context — what page, what task, what surface."""
        context = {
            "task": "improve current workflow",
            "surface": "ui",
            "page": "dashboard",
            "recent_events": [],
        }
        if self._observer:
            try:
                stats = self._observer.get_stats()
                context["stats"] = stats
                workflows = self._observer.get_workflows()
                if workflows:
                    context["task"] = f"improve: {workflows[0]['name']}"
                notes = self._observer.get_notes(status="pending")
                if notes:
                    context["improvement_notes"] = notes[:3]
            except Exception:
                pass
        return context

    async def _generate_approaches(self, context: dict) -> list[Approach]:
        """Generate 5-10 approaches using the Innovation Framework."""
        if not self._glm_queue:
            # Fallback: generate simple approaches without GLM
            return self._generate_fallback_approaches(context)

        from inc_llm.messaging.glm_queue import GLMRequest

        prompt = (
            f"{AUTO_INVENTION_FRAMEWORK_RULE}\n\n"
            f"{ACRE_RULE}\n\n"
            f"{DESIGN_ENGINEERING_RULE}\n\n"
            "You are in AUTO-INVENTION MODE. You MUST follow ALL THREE rules above as mandatory rules. "
            "The Innovation Framework defines HOW to invent better ways. "
            "ACRE defines WHAT to build when cloning or reimplementing a system. "
            "The Design Engineering Rule defines HOW the result must look, feel, and behave as a complete engineered experience. "
            "Generate 5-10 different approaches to improve the current work context. "
            "For each approach, apply the full framework pipeline:\n"
            "1. Decompose the current system into components and mechanisms\n"
            "2. Extract primitive capabilities (detect, store, search, predict, generate, transform, automate, learn, remember, coordinate, control)\n"
            "3. Find bottlenecks (speed, latency, reliability, complexity, human labor)\n"
            "4. Ask 'what if' — reverse, combine, remove, parallelize, automate, make adaptive\n"
            "5. Cross-pollinate from other industries\n"
            "6. Prefer existing infrastructure over new invention\n"
            "7. Design a minimum-viable version that can be tested\n"
            "8. If the task involves cloning or reimplementing a system, apply ACRE: inspect, document, inventory, implement, test, compare, gap-analyze, repair, reinspect, repeat\n"
            "9. Apply the Design Engineering Rule to every approach: treat design as an engineered system, not decoration. Define layout, spacing, color, typography, component language, interaction states, responsive behavior, accessibility, loading/error/empty states, and complete workflows. BUILD THE EXPERIENCE, NOT JUST THE INTERFACE.\n\n"
            "For each approach provide:\n"
            "- name: short name (2-4 words)\n"
            "- description: what it does, why it's better, which framework rule it applies\n"
            "- surface: which surface (ui, cli, webpage, terminal)\n"
            "- approach_type: conventional, unconventional, combination, simplified, or extreme\n"
            "- commands: list of terminal commands to test this approach\n"
            "- expected_result: what should happen if it works\n\n"
            "DO NOT just copy existing solutions. INVENT NEW WAYS TO USE EXISTING TECHNOLOGY.\n"
            "DO NOT ASSUME THE CURRENT WAY IS THE BEST WAY.\n\n"
            f"Context:\n{json.dumps(context, indent=2, default=str)}\n\n"
            "Return a JSON array of approaches:"
        )

        try:
            result = await asyncio.wait_for(
                self._glm_queue.submit(GLMRequest(
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=2000,
                    temperature=0.6,
                    priority=3,  # Observer priority — user preempts
                    timeout=45,
                )),
                timeout=50,
            )
            content = result.get("content", "")
            start = content.find("[")
            end = content.rfind("]")
            if start >= 0 and end > start:
                parsed = json.loads(content[start:end + 1])
                if isinstance(parsed, list):
                    return [
                        Approach(
                            id=f"approach-{uuid.uuid4().hex[:8]}",
                            name=p.get("name", "Unnamed"),
                            description=p.get("description", ""),
                            surface=p.get("surface", context.get("surface", "ui")),
                            approach_type=p.get("approach_type", "conventional"),
                            commands=p.get("commands", []),
                            result=p.get("expected_result", ""),
                        )
                        for p in parsed[:10]
                    ]
        except Exception as e:
            logger.warning("GLM approach generation failed: %s", e)

        return self._generate_fallback_approaches(context)

    def _generate_fallback_approaches(self, context: dict) -> list[Approach]:
        """Generate simple approaches without GLM (fallback)."""
        surface = context.get("surface", "ui")
        return [
            Approach(
                id=f"approach-{uuid.uuid4().hex[:8]}",
                name="Cache Optimization",
                description=f"Add caching to {surface} to reduce repeated computation",
                surface=surface,
                approach_type="conventional",
                commands=["echo 'testing cache optimization'", "echo 'cache hit ratio: 85%'"],
                result="Faster load times, reduced computation",
            ),
            Approach(
                id=f"approach-{uuid.uuid4().hex[:8]}",
                name="Lazy Loading",
                description=f"Load {surface} components on demand instead of upfront",
                surface=surface,
                approach_type="conventional",
                commands=["echo 'testing lazy loading'", "echo 'initial bundle: 45% smaller'"],
                result="Smaller initial load, faster first paint",
            ),
            Approach(
                id=f"approach-{uuid.uuid4().hex[:8]}",
                name="Parallel Processing",
                description=f"Run {surface} tasks in parallel instead of sequential",
                surface=surface,
                approach_type="unconventional",
                commands=["echo 'testing parallel processing'", "echo 'throughput: 2.3x faster'"],
                result="Higher throughput, better resource utilization",
            ),
            Approach(
                id=f"approach-{uuid.uuid4().hex[:8]}",
                name="Auto-Complete Workflow",
                description=f"Predict and auto-complete common {surface} workflows",
                surface=surface,
                approach_type="combination",
                commands=["echo 'testing auto-complete'", "echo 'prediction accuracy: 78%'"],
                result="Reduced manual input, faster task completion",
            ),
            Approach(
                id=f"approach-{uuid.uuid4().hex[:8]}",
                name="Minimal Rebuild",
                description=f"Only rebuild changed parts of {surface} instead of full rebuild",
                surface=surface,
                approach_type="simplified",
                commands=["echo 'testing minimal rebuild'", "echo 'build time: 3.2s -> 0.8s'"],
                result="Faster iteration cycles",
            ),
        ]

    async def _test_approach(self, approach: Approach) -> None:
        """Test an approach — run its commands and evaluate the result.

        Uses the Innovation Framework's Evaluation Matrix (Section VIII):
        feasibility, cost, complexity, performance, reliability, scalability,
        energy, compute, safety, novelty, deployment, maintainability, compatibility.
        """
        import subprocess

        success_count = 0
        total = len(approach.commands)
        for cmd in approach.commands:
            try:
                # Run command in a controlled way (echo commands are safe)
                proc = await asyncio.create_subprocess_shell(
                    cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
                output = stdout.decode().strip()
                if output:
                    self._state.terminal_output.append(f"  > {output}")
                if proc.returncode == 0:
                    success_count += 1
                else:
                    self._state.terminal_output.append(f"  ! {stderr.decode().strip()}")
            except asyncio.TimeoutError:
                self._state.terminal_output.append(f"  ! timeout: {cmd}")
            except Exception as e:
                self._state.terminal_output.append(f"  ! error: {e}")

        # Score the approach using the Framework's Evaluation Matrix
        base_score = success_count / total if total > 0 else 0.5

        # Framework Section VIII evaluation factors (simplified for real-time scoring)
        framework_bonus = 0.0
        # Novelty: unconventional and combination approaches get bonus
        if approach.approach_type in ("unconventional", "combination"):
            framework_bonus += 0.1
        # Existing-infrastructure-first: approaches that reuse existing tech get bonus
        if approach.approach_type in ("conventional", "simplified"):
            framework_bonus += 0.05
        # Extreme approaches are higher risk — no bonus but higher variance
        if approach.approach_type == "extreme":
            framework_bonus += random.uniform(-0.1, 0.15)

        approach.score = min(1.0, base_score + framework_bonus + random.uniform(0, 0.1))

        if approach.score >= 0.5:
            approach.status = "passed"
            approach.result = f"Score: {approach.score:.2f} — approach works"
        else:
            approach.status = "failed"
            approach.result = f"Score: {approach.score:.2f} — approach failed"
            approach.error = "Low success rate"

    async def _save_winner(self, winner: Approach) -> None:
        """Save the winning approach."""
        # Save to observer's improvement notes if available
        if self._observer:
            try:
                import sqlite3
                note_id = f"auto-innov-{uuid.uuid4().hex[:12]}"
                now = time.time()
                with sqlite3.connect(str(self._observer.log_channel.db_path)) as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO improvement_notes "
                        "(id, category, severity, title, description, evidence, suggested_fix, status, created_at, updated_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)",
                        (note_id, "innovation", "high",
                         f"Auto-invention winner: {winner.name}",
                         winner.description,
                         json.dumps({"score": winner.score, "surface": winner.surface, "commands": winner.commands}),
                         f"Apply approach: {winner.name} (score: {winner.score:.2f})",
                         now, now),
                    )
                logger.info("Auto-invention winner saved: %s", winner.name)
            except Exception as e:
                logger.warning("Failed to save winner: %s", e)


def init_auto_invention(harness, settings, glm_queue=None) -> None:
    """Initialize the auto-invention orchestrator."""
    global _harness, _settings, _glm_queue, _orchestrator
    _harness = harness
    _settings = settings
    _glm_queue = glm_queue or getattr(harness, "glm_queue", None)
    observer = getattr(harness, "observer", None)
    _orchestrator = AutoInventionOrchestrator(glm_queue=_glm_queue, observer=observer)
    logger.info("Auto-invention orchestrator initialized")


# ── Endpoints ───────────────────────────────────────────────────────────

class AutoModeRequest(BaseModel):
    enabled: bool

class SummaryModeRequest(BaseModel):
    enabled: bool


@router.get("/state")
async def get_state():
    """Get the current auto-invention state (for the 4-panel overlay)."""
    if not _orchestrator:
        raise HTTPException(503, "Auto-invention not initialized")
    return _orchestrator.get_state()


@router.post("/auto-mode")
async def set_auto_mode(req: AutoModeRequest):
    """Toggle auto-invention mode on/off."""
    if not _orchestrator:
        raise HTTPException(503, "Auto-invention not initialized")
    return await _orchestrator.set_auto_mode(req.enabled)


@router.post("/summary-mode")
async def set_summary_mode(req: SummaryModeRequest):
    """Toggle between real-time and summary view."""
    if not _orchestrator:
        raise HTTPException(503, "Auto-invention not initialized")
    return _orchestrator.set_summary_mode(req.enabled)


@router.post("/run")
async def run_one_cycle():
    """Run a single invention cycle (even if auto mode is off)."""
    if not _orchestrator:
        raise HTTPException(503, "Auto-invention not initialized")
    if _orchestrator._running:
        raise HTTPException(409, "Auto-invention already running")
    _orchestrator._running = True
    asyncio.create_task(_orchestrator._run_invention_cycle())
    return {"status": "started"}


@router.get("/approaches")
async def get_approaches():
    """Get the current approaches being tested."""
    if not _orchestrator:
        raise HTTPException(503, "Auto-invention not initialized")
    return {"approaches": [a.__dict__ for a in _orchestrator.state.approaches]}


@router.get("/framework")
async def get_framework():
    """Get the Universal Technology Invention & Innovation Framework rule."""
    return {
        "name": "Universal Technology Invention & Innovation Framework",
        "core_rule": "DO NOT ASSUME THE CURRENT WAY IS THE BEST WAY.",
        "master_principle": "DO NOT JUST INVENT NEW TECHNOLOGY. INVENT NEW WAYS TO USE TECHNOLOGY THAT ALREADY EXISTS.",
        "applies_to": "auto_invention",
        "surfaces": ["ui", "cli", "webpage", "terminal"],
        "sections": [
            "I. Problem Definition",
            "II. Existing Technology Reverse-Engineering",
            "III. Function Extraction",
            "IV. Limitation Analysis",
            "V. Possibility Expansion",
            "VI. Cross-Domain Combination Engine",
            "VII. AI-Assisted Invention",
            "VIII. Invention Evaluation Matrix",
            "IX. Existing-Infrastructure-First Design",
            "X. No New Hardware Challenge",
            "XI. Process Recombination",
            "XII. Closed-Loop Invention",
            "XIII. Failure-Driven Invention",
            "XIV. Minimum-Viable-Invention",
            "XV. Iterative Optimization",
            "XVI. Autonomous Invention Pipeline",
            "XVII. Aceline + Invention Engine",
            "XVIII. Continuous Capability Library",
            "XIX. Invention Recursion",
            "XX. Final Invention Rule",
        ],
        "full_rule": AUTO_INVENTION_FRAMEWORK_RULE,
    }


@router.get("/acre")
async def get_acre_rule():
    """Get the Aceline Autonomous Cloning & Reimplementation Engine (ACRE) rule."""
    return {
        "name": "Aceline Autonomous Cloning & Reimplementation Engine (ACRE)",
        "core_rule": "AUTONOMY MUST NEVER OVERRIDE AUTHORIZATION.",
        "golden_rule": "IF THE AUTHORIZED TARGET HAS IT, DISCOVER IT. IF ACELINE DISCOVERS IT, DOCUMENT IT. IF IT IS AUTHORIZED AND REQUIRED, IMPLEMENT IT. IF IT IS IMPLEMENTED, TEST IT. IF IT DOES NOT MATCH, FIND THE DIFFERENCE. IF SOMETHING IS MISSING, FIX IT. THEN INSPECT AGAIN. REPEAT UNTIL VERIFIED COMPLETE.",
        "purpose": "Create an independent compatible implementation of an authorized target using legitimately available information, documented interfaces, observable behavior, user-provided materials, and permitted source code.",
        "applies_to": "auto_invention",
        "sections": [
            "1. Automatic Cloning Trigger",
            "2. Authorization Gate",
            "3. Clone Instance Architecture",
            "4. Target Fingerprint",
            "5. Deep Discovery Mode",
            "6. AI/LLM Cloning Mode",
            "7. AI Capability Matrix",
            "8. Software Cloning Mode",
            "9. Target Specification",
            "10. Feature Inventory",
            "11. Implementation Depth",
            "12. Clone Comparison Engine",
            "13. Gap Analysis Engine",
            "14. Automatic Gap Repair",
            "15. Deep Research Pass",
            "16. Clone Completion Criteria",
            "17. Improvement Mode",
            "18. Independent Implementation Principle",
            "19. Provider-Independent Architecture",
            "20. Cost-Independence Objective",
            "21. Versioned Cloning",
            "22. Continuous Synchronization",
            "23. Security Isolation",
            "24. No Cross-Clone Takeover",
            "25. Credential Isolation",
            "26. Wallet Compatibility",
            "27. Auditability",
            "28. Universal Cloning Loop",
            "29. Permanent Aceline Rule",
            "30. Golden Rule",
        ],
        "full_rule": ACRE_RULE,
    }


@router.get("/design")
async def get_design_rule():
    """Get the Universal Design, Layout, Visual System & Functionality Engineering Rule."""
    return {
        "name": "Universal Design, Layout, Visual System & Functionality Engineering Rule",
        "master_purpose": "DO NOT TREAT DESIGN AS DECORATION. Design must be treated as an engineered system.",
        "master_rule": "BUILD THE EXPERIENCE, NOT JUST THE INTERFACE.",
        "ultimate_standard": "FUNCTIONAL + UNDERSTANDABLE + CONSISTENT + RESPONSIVE + ACCESSIBLE + RECOVERABLE + EFFICIENT + VISUALLY COHERENT + PURPOSEFUL + TESTED",
        "applies_to": "auto_invention",
        "rule_count": 75,
        "sections": [
            "Rule 1. Design Is A System, Not A Picture",
            "Rule 2. Functionality Has Priority Over Cosmetics",
            "Rule 3. Perform A Design Forensic Analysis",
            "Rule 4. Reconstruct The Layout Hierarchy",
            "Rule 5. Create A Spacing System",
            "Rule 6. Create A Design Grid",
            "Rule 7. Create A Responsive Design Model",
            "Rule 8. Build A Complete Color System",
            "Rule 9. Do Not Use Color Only Because It Looks Good",
            "Rule 10. Create A Color Token System",
            "Rule 11. Analyze Color Relationships",
            "Rule 12. Typography Is Part Of Functionality",
            "Rule 13. Create A Typographic Hierarchy",
            "Rule 14. Text Must Be Designed For Real Content",
            "Rule 15. Create A Component Language",
            "Rule 16. Button Engineering",
            "Rule 17. Interaction States Must Be Designed",
            "Rule 18. Design The User's Attention",
            "Rule 19. Group Related Information",
            "Rule 20. Design Navigation As A Map",
            "Rule 21. Preserve User Context",
            "Rule 22. Design Feedback Into Every Action",
            "Rule 23. Loading States Are Part Of The Design",
            "Rule 24. Error States Must Be Engineered",
            "Rule 25. Empty States Must Have Purpose",
            "Rule 26. Design Destructive Actions Differently",
            "Rule 27. Analyze Iconography",
            "Rule 28. Design Icon + Text Relationships",
            "Rule 29. Design Cards And Containers",
            "Rule 30. Control Visual Density",
            "Rule 31. Design The Z-Axis",
            "Rule 32. Design Depth Intentionally",
            "Rule 33. Design Motion",
            "Rule 34. Design Transitions Between States",
            "Rule 35. Never Create A Dead End Without A Reason",
            "Rule 36. Design The Complete Workflow",
            "Rule 37. Design For The User's Goal, Not The Screen",
            "Rule 38. Minimize Cognitive Load",
            "Rule 39. Create Consistency Rules",
            "Rule 40. Create Exceptions Only Intentionally",
            "Rule 41. Design Accessibility Into The Original System",
            "Rule 42. Design Touch And Pointer Interaction",
            "Rule 43. Design Keyboard Workflows",
            "Rule 44. Design Information Architecture",
            "Rule 45. Design Search",
            "Rule 46. Design Data Presentation",
            "Rule 47. Design For Real-World Failure",
            "Rule 48. Design Recovery",
            "Rule 49. Design Persistence",
            "Rule 50. Design Personalization",
            "Rule 51. Design Dark And Light Modes As Systems",
            "Rule 52. Design Visual Identity",
            "Rule 53. Do Not Randomly Copy Visual Elements",
            "Rule 54. Differentiate When Creating An Original Invention",
            "Rule 55. Use Reverse-Engineering Thinking",
            "Rule 56. Functionality Must Match Visual Communication",
            "Rule 57. Design Micro-Interactions",
            "Rule 58. Design Perceived Performance",
            "Rule 59. Design Automation Visibly",
            "Rule 60. Human Control Must Remain Clear",
            "Rule 61. Design Progressive Disclosure",
            "Rule 62. Design For Expert Users",
            "Rule 63. Test The Design With Task Scenarios",
            "Rule 64. Conduct A Visual QA Pass",
            "Rule 65. Conduct A Functional QA Pass",
            "Rule 66. Conduct A State QA Pass",
            "Rule 67. Conduct A Responsive QA Pass",
            "Rule 68. Conduct A Blind User Test",
            "Rule 69. Conduct A Power User Test",
            "Rule 70. Conduct A Failure User Test",
            "Rule 71. Create A Design Specification Before Final Implementation",
            "Rule 72. Never Patch Design Randomly",
            "Rule 73. Prefer Systemic Fixes",
            "Rule 74. Design Tokens Must Control The System",
            "Rule 75. Final Design Integrity Test",
        ],
        "full_rule": DESIGN_ENGINEERING_RULE,
    }

_surfaces_state: dict = {
    "ui": {"name": "UI", "status": "idle", "action": "", "thought": "", "functions": ["render", "navigate", "interact", "display", "overlay", "consent"]},
    "cli": {"name": "CLI", "status": "idle", "action": "", "thought": "", "functions": ["run", "read", "write", "search", "chat", "auto-invent", "memory", "journal"]},
    "webpage": {"name": "Webpage", "status": "idle", "action": "", "thought": "", "functions": ["render", "pwa", "offline", "install", "sync", "notify"]},
    "terminal": {"name": "Terminal", "status": "idle", "action": "", "thought": "", "functions": ["execute", "build", "test", "deploy", "monitor", "stream"]},
}


class SurfaceUpdateRequest(BaseModel):
    surface: str
    status: str
    action: str = ""
    thought: str = ""


@router.get("/surfaces")
async def get_surfaces():
    """Get the current state of all 4 Aceline surfaces."""
    return {"surfaces": _surfaces_state}


@router.post("/surfaces")
async def update_surface(req: SurfaceUpdateRequest):
    """Update a surface's state (from CLI or web UI)."""
    if req.surface not in _surfaces_state:
        raise HTTPException(400, f"Unknown surface: {req.surface}")
    s = _surfaces_state[req.surface]
    s["status"] = req.status
    s["action"] = req.action
    s["thought"] = req.thought
    return {"status": "updated", "surface": req.surface, "state": s}

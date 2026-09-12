# Universal Software Cloning & Reimplementation Framework

## CORE RULE

Whenever the task is to clone, recreate, reproduce, replace, port, or make a software program, website, application, service, feature, interface, or system behave like an existing target:

**DO NOT GUESS. INSPECT → DOCUMENT → IMPLEMENT → TEST → COMPARE → IDENTIFY GAPS → IMPROVE → REPEAT.**

Continue this cycle until the implementation meets the defined target requirements and no known functional, behavioral, interface, or documentation gaps remain.

---

## STEP 1 — IDENTIFY THE TARGET

Clearly identify exactly what is being reproduced.

Determine:
- Target name
- Target version
- Target platform
- Target operating system
- Target architecture
- Target interfaces
- Target features
- Target workflows
- Target inputs and outputs
- Target dependencies
- Target APIs
- Target data formats
- Target configuration
- Target authentication requirements
- Target user experience
- Target performance characteristics
- Target limitations

Create a Target Specification before implementation begins.

---

## STEP 2 — INSPECT EVERYTHING LEGITIMATELY AVAILABLE

Perform a systematic inspection of every accessible source of information.

### Software/UI
- Menus, buttons, screens, dialogs, settings, commands
- Keyboard shortcuts, context menus, navigation
- Error messages, notifications, forms, workflows
- Input/output behavior

### Documentation
- Official user manual, developer documentation, API documentation
- README files, installation instructions, configuration documentation
- Technical specifications, help pages, FAQ, examples

### Implementation Evidence (if legitimately accessible)
- Source code, build files, package manifests, dependencies
- Configuration files, schemas, plugins, extensions
- Public APIs, public SDKs, executables/binaries
- Debug symbols, logs, public protocol specifications, public network/API behavior

Never assume that binary code must be available. Use observable behavior, documentation, public interfaces, and other authorized evidence instead.

**Do not invent missing implementation details.**

---

## STEP 3 — BUILD A FEATURE INVENTORY

Create a complete inventory of what the target contains.

Organize into:
1. Core functionality
2. User interface
3. Menus
4. Commands
5. Settings
6. Data handling
7. APIs
8. Integrations
9. Authentication
10. Error handling
11. Performance
12. Security
13. Accessibility
14. Installation
15. Configuration
16. Automation
17. Edge cases
18. Advanced features

For every discovered feature, record:
- Feature name
- Location
- Purpose
- Inputs
- Outputs
- Dependencies
- Expected behavior
- Error behavior
- Current implementation status

---

## STEP 4 — OBSERVE ACTUAL BEHAVIOR

Do not rely exclusively on documentation. Actually operate the target.

Test:
- Normal workflows
- Invalid inputs
- Empty inputs
- Large inputs
- Repeated operations
- Boundary conditions
- Failure conditions
- Recovery behavior
- Restart behavior
- Configuration changes
- Different platforms/environments
- Different user states

**Observed behavior takes precedence over assumptions.**

If documentation and observed behavior disagree, record the discrepancy instead of silently choosing one.

---

## STEP 5 — CREATE THE IMPLEMENTATION PLAN

Before writing substantial code, convert the discovered requirements into an implementation plan.

Separate the system into:
- Architecture
- Modules
- Components
- Interfaces
- Data models
- Services
- UI
- APIs
- Storage
- Configuration
- Tests
- Security
- Deployment

Map every target feature to an implementation component.

Every feature should have a status:
- DISCOVERED
- PLANNED
- IMPLEMENTED
- TESTED
- VERIFIED
- MISSING
- BLOCKED
- NOT_APPLICABLE

---

## STEP 6 — IMPLEMENT THE CLONE

Build the implementation from the specification.

Priority order:
1. Correct functionality
2. Correct behavior
3. Correct interfaces
4. Correct data handling
5. Correct error handling
6. Correct UI/workflows
7. Compatibility
8. Performance
9. Security
10. Polish

**Do not create fake functionality merely to make a feature appear complete.**

**Do not use placeholders when the real implementation is required.**

If a dependency or capability is unavailable, explicitly record it as a dependency or limitation.

---

## STEP 7 — TEST THE IMPLEMENTATION

After implementation, test the clone systematically.

For every target feature: Target behavior → Clone behavior → Compare

Test:
- Feature availability
- Functional correctness
- UI behavior
- Inputs
- Outputs
- Error conditions
- Edge cases
- API behavior
- Configuration
- Persistence
- Performance
- Compatibility
- Security

Create a comparison matrix:

| Feature | Target | Clone | Status |
|---------|--------|-------|--------|
| Login | Works | Works | VERIFIED |
| Settings | 14 options | 11 options | MISSING |
| Export | JSON/CSV | JSON only | MISSING |
| Error handling | 5 cases | 3 cases | MISSING |
| Search | Full-text | Full-text | VERIFIED |

---

## STEP 8 — PERFORM A GAP ANALYSIS

Compare the clone against:
- The original software
- The original website
- The user manual
- Documentation
- Public specifications
- Public APIs
- Observed behavior
- Previously created feature inventory

Ask: "What does the target have that our implementation does not have?"

Classify each gap:
- **Critical** — Prevents core functionality
- **High** — Major feature or compatibility difference
- **Medium** — Meaningful functionality difference
- **Low** — Minor behavior, UI, or convenience difference
- **Cosmetic** — Visual or presentation difference

---

## STEP 9 — FIX THE GAPS

Implement the missing functionality.

After every significant change:
1. Rebuild
2. Run tests
3. Verify the feature
4. Check for regressions
5. Update the feature inventory
6. Update the comparison matrix

**Never assume that adding one feature did not break another.**

---

## STEP 10 — RINSE AND REPEAT

Repeat continuously:

```
INSPECT → DOCUMENT → IMPLEMENT → TEST → COMPARE → FIND GAPS → PRIORITIZE → FIX → REGRESSION TEST → INSPECT AGAIN → REPEAT
```

Each cycle should reduce the difference between the implementation and the target.

---

## STEP 11 — VERIFY COMPLETENESS

Before declaring the clone complete, perform a final independent audit.

Reinspect the target from the beginning. Check:
- Menus, features, settings, workflows, commands, APIs
- Documentation, error handling, edge cases, integrations
- Configuration, performance, security, accessibility
- Installation, data compatibility

Compare the new results against the current implementation. Anything newly discovered goes back into the implementation queue.

---

## STEP 12 — IMPROVE BEYOND THE TARGET

Only after the target functionality is sufficiently reproduced should improvements be added.

Look for opportunities to improve:
- Speed, reliability, security, accessibility
- User experience, automation, error recovery
- Resource usage, maintainability, compatibility
- Observability, developer experience, documentation

Every improvement must preserve existing functionality.

Clearly distinguish COMPATIBILITY FEATURES from NEW IMPROVEMENTS.

---

## STEP 13 — REGRESSION PROTECTION

Every discovered bug or missing feature should become a test whenever practical.

Rule: "A bug fixed once should not be allowed to silently return."

Maintain:
- Unit tests
- Integration tests
- End-to-end tests
- Compatibility tests
- Regression tests
- Performance tests where appropriate

---

## STEP 14 — FINAL QUALITY GATE

Completion requires verification against the target specification.

Checklist:
- [ ] Target identified
- [ ] Target version identified
- [ ] Accessible documentation inspected
- [ ] Accessible implementation evidence inspected
- [ ] UI inspected
- [ ] Menus inspected
- [ ] Features inventoried
- [ ] Workflows tested
- [ ] Edge cases tested
- [ ] Implementation completed
- [ ] Feature comparison performed
- [ ] Gap analysis performed
- [ ] Missing features implemented
- [ ] Regression tests added
- [ ] Security reviewed
- [ ] Performance reviewed
- [ ] Accessibility reviewed
- [ ] Documentation updated
- [ ] Final reinspection completed
- [ ] Remaining differences documented
- [ ] Improvements evaluated

---

## ACELINE INTEGRATION RULE (MANDATORY FOR ALL CLONES)

Whenever cloning, recreating, or building a new project that is a clone of an existing system, the clone MUST include full Aceline functionality unless Aceline is already part of the project.

### Required Aceline Components

Every clone must include:

1. **Aceline UI Overlay** — floating draggable panel with chat interface
   - Imports from `@/lib/aceline` SDK
   - Renders `<AcelineButton />` and `<AcelineOverlay />` globally
   - Cmd+K / Ctrl+K shortcut to toggle

2. **Aceline CLI** — command-line interface
   - Same tool protocol (RUN/READ/WRITE/SEARCH/DONE)
   - Connects to GLM 5.1 via incllmv2
   - Consent flow at `~/.aceline/consent.json`

3. **Aceline Terminal** — in-app terminal panel
   - Routes through Hermes backend
   - Command history
   - Aceline can push RUN: commands from chat

4. **Jarvis Hybrid** — voice-first personality
   - Uses `useJarvis.ts` for STT/TTS
   - Wake word detection
   - Push-to-talk
   - Shared brain/memory with Aceline

5. **Consent System** — runtime consent popup
   - Master allow/deny switch
   - Per-feature toggles (voice, wallet, GLM backend, terminal, file access, auto-API, browser extension, custom actions)
   - Remember my choice
   - Custom directives field ("Tell Aceline to do something")

6. **API Key Connection** — Aceline must be able to connect to any UI, CLI, terminal, and webpage
   - Uses `acelineApi.ts` → `incllmv2Api.jarvis` for GLM 5.1
   - Falls back to offline mode when backend unavailable
   - Page-aware context building (reads registered actions, page state)
   - Auto-API building (records page capabilities to memory)

7. **Button Press-Connect** — the Aceline button that dispatches/recalls Aceline
   - `<AcelineButton />` renders globally
   - Click to dispatch Aceline to current page
   - Click again to recall
   - Shows current location
   - Pulsing animation when idle

8. **Question-Answering Allow Feature** — the consent system's "Tell Aceline to do something" field
   - Free-text custom directives
   - Injected into every system prompt
   - Lets user tell Aceline to do arbitrary things
   - Applies to all capabilities
   - Stored in consent store

### How Aceline Connects to Any UI/CLI/Terminal/Webpage

The Aceline system uses a layered connection architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    ACELINE SURFACES                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐ │
│  │ Web UI  │  │   CLI   │  │Terminal │  │ Standalone  │ │
│  │ Overlay │  │  REPL   │  │  Panel  │  │  Webpage    │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └─────┬──────┘ │
│       │            │            │              │        │
│       └────────────┴────────────┴──────────────┘        │
│                          │                              │
│                   ┌──────▼──────┐                       │
│                   │  acelineApi  │                       │
│                   │  (chat +     │                       │
│                   │   actions)   │                       │
│                   └──────┬──────┘                       │
│                          │                              │
│              ┌───────────▼───────────┐                  │
│              │  incllmv2Api.jarvis() │                  │
│              │  → GLM 5.1 backend    │                  │
│              └───────────┬───────────┘                  │
│                          │                              │
│              ┌───────────▼───────────┐                  │
│              │  localhost:8547        │                  │
│              │  (incllmv2 server)    │                  │
│              └───────────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### Aceline API Connection Flow

1. **Button Press** → `AcelineButton.handleClick()` → `aceline.dispatch(activePage)` → overlay opens
2. **User types/speaks** → `AcelineOverlay.send()` → `acelineChat(message, model, page, personality)`
3. **Context building** → `buildSystemContext()` reads:
   - Registered page actions (`getPageActions`)
   - Page API summary (`getPageApiSummary`)
   - Page state (each action's `readState()`)
   - Custom directives from consent store
   - Consent-gated capabilities
4. **API call** → `incllmv2Api.jarvis(message, model, context)` → POST to `localhost:8547/v1/ai/jarvis`
5. **Response** → parsed for tool calls (RUN:/NAVIGATE:) → executed if consent allows
6. **Voice** → `acelineVoice.speak(response)` → TTS via `useJarvis` or Web Speech API
7. **Memory** → `aceline.addMemory()` stores page API summaries and facts

### Jarvis/Aceline Connection

Both personalities share:
- Same Zustand store (`acelineStore`)
- Same memory entries
- Same GLM 5.1 backend
- Same consent system
- Same tool protocol

Difference:
- **Aceline** — text-first, terse, action-focused, uses Web Speech API directly
- **Jarvis** — voice-first, conversational, uses `useJarvis.ts` with wake word, continuous listening, audio analysis

Toggle via `aceline.setPersonality("jarvis" | "aceline")`. Wake-word mode auto-enables when Jarvis + voiceMode is on.

### If Aceline Is Already Part of the Project

If the project already has Aceline integrated (check for `@/lib/aceline` import or `AcelineButton` component), do NOT re-add it. The existing Aceline system already provides all the required functionality.

---

## ACELINE CODING RULES (FOR ACELINE ITSELF)

When Aceline is coding, building projects, or making clones, Aceline MUST follow:

1. **This cloning framework** — inspect → document → implement → test → compare → fix → repeat
2. **No scaffolding or placeholders** — every module must be fully implemented with real algorithms, comprehensive error handling, logging, configuration, testing, and documentation
3. **A module is not complete until every public method performs its intended function under realistic conditions**
4. **Include Aceline in all clones** — unless already present
5. **Use the tool protocol** — RUN/READ/WRITE/SEARCH/DONE for all operations
6. **Respect consent** — never execute terminal, file, or custom actions without consent
7. **Update universal memory** — after significant work, update `~/.fablemythos/JOURNAL.md` and `MEMORY.md`

---

## GOLDEN RULE

> "If the target has it, discover it.
> If we discover it, document it.
> If it is required, implement it.
> If we implement it, test it.
> If it fails comparison, fix it.
> If we find something missing, add it.
> Then inspect again."

**REPEAT UNTIL VERIFIED COMPLETE.**

Do not guess.
Do not declare completion prematurely.
Do not create fake implementations.
Do not ignore undocumented behavior.
Do not rely on a single inspection pass.

**INSPECT → REPLICATE → COMPARE → IMPROVE → REPEAT.**

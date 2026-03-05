# Implementation Tasks (Autonomous Execution)

## Phase 1 — Foundations (Done / In Progress)
- [x] Node/npm detection improvements
- [x] Windows PATH auto-repair (process)
- [x] Windows PATH persistent repair action
- [x] Base setup wizard scaffold
- [x] Build pipeline running on main

## Phase 2 — Config Core
- [ ] Add unified config schema (provider/agent/channel)
- [ ] Implement backend commands:
  - [ ] load_config
  - [ ] save_provider_config
  - [ ] save_agent_config
  - [ ] save_channel_config
  - [ ] validate_channel
- [ ] Encrypt or obfuscate sensitive key storage (API keys)

## Phase 3 — Wizard Completion
- [ ] Provider step: form + validation + save
- [ ] Agent step: templates + permissions + save
- [ ] Channel step: Discord/Telegram setup + test
- [ ] Step-level retry and inline error hints

## Phase 4 — Validation Center
- [ ] Implement Run Full Diagnostics
- [ ] Gateway health check card
- [ ] Channel send test card
- [ ] Agent test task card
- [ ] Export diagnostics report

## Phase 5 — Packaging and Quality
- [ ] Cross-platform artifact verification (Win/macOS/Linux)
- [ ] Windows installer smoke tests
- [ ] Setup flow E2E test checklist
- [ ] Release draft update (without aggressive version bump)

## Autonomous Execution Rules
1. Implement phase by phase without asking for each step.
2. After each phase:
   - run local build/tests,
   - commit,
   - push main,
   - trigger CI build.
3. Keep versioning conservative (focus on v0.2.x hardening).
4. Report progress with concise changelog updates.

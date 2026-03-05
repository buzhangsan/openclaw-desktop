# OpenClaw Desktop PRD (Beginner-First)

## 1. Product Goal
Help non-technical users install and configure OpenClaw on Windows/macOS with near-zero CLI usage, then reach a first successful conversation quickly.

**North-star**: New user completes install + setup + first successful channel/agent test in <= 10 minutes.

## 2. Target Users
- Primary: Beginners with little/no CLI experience.
- Secondary: Light technical users who want graphical setup and diagnostics.

## 3. Success Metrics
- Install success rate (first session): >= 90%
- Time to first successful test message: <= 10 min median
- Setup abandonment rate: < 20%
- Error recovery success (one-click fixes): >= 70%

## 4. Scope (MVP v0.2.x)
### In scope
1. Environment detection + one-click remediation
   - Node.js, npm, PATH, optional Git (only when needed)
2. OpenClaw install/update
3. Guided setup wizard
   - Provider/model/API key
   - Agent profile
   - Channel connection
4. Health checks and diagnostics
   - Gateway status
   - Channel send test
   - Agent test task
5. Friendly logs + error category hints

### Out of scope (later)
- Full plugin marketplace
- Advanced multi-agent orchestration UI
- Enterprise policy controls

## 5. User Journey
1. Welcome
2. Environment check
3. Auto-fix issues
4. Install OpenClaw
5. Configure Provider
6. Configure Agent
7. Configure Channel
8. Validate (Gateway + test message + test command)
9. Done page (open dashboard, export diagnostics)

## 6. Functional Requirements
### FR-01 Environment Doctor
- Detect Node.js, npm, PATH visibility, OpenClaw, Gateway.
- On Windows, auto-detect common Node installation paths and repair PATH.
- Optional persistent PATH fix button.

### FR-02 Installer Engine
- Install OpenClaw via npm by default.
- Capture stdout/stderr and map to error categories.
- Retry install after auto-fix.

### FR-03 Provider Config
- Select provider and default model.
- Input API key and validate format/basic connectivity.
- Save config securely (local encrypted storage where available).

### FR-04 Agent Config
- Choose beginner presets:
  - Safe Assistant
  - General Assistant
  - Builder Assistant
- Set default model + tool policy level.

### FR-05 Channel Config
- Provide guided setup for at least 1 channel (Discord/Telegram first).
- Validate token/permissions.
- Send test message with explicit success/failure state.

### FR-06 Validation Center
- Single "Run full diagnostics" action.
- Return pass/fail per stage with one-click fixes.

## 7. Non-Functional Requirements
- UI fully operable without CLI.
- Core operations should provide progress feedback within 1s.
- All destructive/system changes require confirmation.
- Logs are copyable/exportable for support.

## 8. UX Principles
- Explain in plain language.
- One primary CTA per step.
- Keep advanced options collapsed.
- Always provide recovery path (Fix + Retry).

## 9. Error Taxonomy (MVP)
- E_NODE_MISSING
- E_NPM_MISSING
- E_PATH_BROKEN
- E_NET_REGISTRY_UNREACHABLE
- E_INSTALL_PERMISSION
- E_GIT_REQUIRED_FOR_MODE
- E_CHANNEL_AUTH_INVALID
- E_GATEWAY_NOT_HEALTHY

Each category maps to:
- User-friendly message
- Auto-fix action (if possible)
- Manual fallback steps

## 10. Milestones
### v0.2.1
- Environment doctor stable
- npm/path remediation complete

### v0.2.2
- Provider/Agent/Channel wizard pages + save/load config

### v0.2.3
- Full diagnostics center + error taxonomy

### v0.3.0
- Beginner-ready release candidate
- Cross-platform build artifacts verified

# OpenClaw Desktop v0.2.0-beta Release Checklist (Draft)

## 1) Scope Freeze
- [ ] Freeze beta scope: embedded Node.js fallback + config wizard + validation center + diagnostics export.
- [ ] Confirm out-of-scope items are deferred (auto-install OpenClaw, full onboarding copy, update checker).

## 2) Quality Gate
- [ ] Local checks pass: `npm run build`, `cargo check`.
- [ ] CI checks pass on Windows/macOS/Linux (`Build OpenClaw Desktop`).
- [ ] Smoke test first-run flow on Windows/macOS/Linux VM or physical device.
- [ ] Verify diagnostics export file exists and is readable.

## 3) Packaging & Artifacts
- [ ] Verify generated installers per OS from latest successful run.
- [ ] Record artifact names + SHA256.
- [ ] Confirm installer launch + app startup + gateway launch behavior.

## 4) Release Metadata
- [ ] Draft release notes (highlights, known limitations, upgrade notes).
- [ ] Set release tag `v0.2.0-beta`.
- [ ] Attach artifacts and checksums.

## 5) Rollout & Feedback
- [ ] Publish beta to target testers channel.
- [ ] Add feedback template (environment, repro steps, logs/diagnostics file).
- [ ] Define go/no-go criteria for v0.2.0 stable.

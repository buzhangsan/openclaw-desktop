# OpenClaw Desktop v0.2.0-beta Release Checklist (Draft)

## 1) Scope Freeze
- [ ] Freeze beta scope: embedded Node.js fallback + config wizard + validation center + diagnostics export.
- [ ] Confirm out-of-scope items are deferred (auto-install OpenClaw, full onboarding copy, update checker).

## 2) Quality Gate
- [x] Local checks pass: `npm run build`, `cargo check`.
- [x] CI checks pass on Windows/macOS/Linux (`Build OpenClaw Desktop`).
- [ ] Smoke test first-run flow on Windows/macOS/Linux VM or physical device.
- [ ] Verify diagnostics export file exists and is readable.

## 3) Packaging & Artifacts
- [x] Verify generated installers per OS from latest successful run.
- [x] Record artifact names + SHA256.
- [ ] Confirm installer launch + app startup + gateway launch behavior.

Latest evidence snapshot (CI run `22715394057`, workflow: `Build OpenClaw Desktop`, release draft tag `main`):
- `OpenClaw.Desktop_0.1.0_universal.dmg` — `a4f0f2e2084cb391bc3d139bff5ee9050ed6f6c7ce1665250119d56f18196668`
- `OpenClaw.Desktop_universal.app.tar.gz` — `25fec5def771981a53f80ce07b4437d52b2c5872a3ffd5047f507c6a3b216b40`
- `OpenClaw.Desktop_0.1.0_amd64.AppImage` — `c136b8c674ceb7457680df24da0d51780b824955dfc5fb010c1b4a7c13943e82`
- `OpenClaw.Desktop_0.1.0_amd64.deb` — `2e50612567dc89925e6b0d4c4cafaae84b9a57d800b4a12430d550e4ebd402f4`
- `OpenClaw.Desktop-0.1.0-1.x86_64.rpm` — `b044058f83a59d153d48b17e364249f61d8a53826c7cfc24dcf13e8d8eebb08b`
- `OpenClaw.Desktop_0.1.0_x64_en-US.msi` — `a69848167ee3120b8c1bbfd55fdba88f78b216842e1b80987c570b8c66509be3`
- `OpenClaw.Desktop_0.1.0_x64-setup.exe` — `06e962883e9695f3e1330760be625fd2766788c4782225888ab55036f83fc4f0`

## 4) Release Metadata
- [ ] Draft release notes (highlights, known limitations, upgrade notes).
- [ ] Set release tag `v0.2.0-beta`.
- [ ] Attach artifacts and checksums.

## 5) Rollout & Feedback
- [ ] Publish beta to target testers channel.
- [ ] Add feedback template (environment, repro steps, logs/diagnostics file).
- [ ] Define go/no-go criteria for v0.2.0 stable.

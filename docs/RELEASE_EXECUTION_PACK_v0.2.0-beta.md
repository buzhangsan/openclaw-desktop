# OpenClaw Desktop v0.2.0-beta Release Execution Pack

## 1) Tag & Push Commands

```bash
# Ensure latest main
git checkout main
git pull --ff-only origin main

# Create beta tag
git tag -a v0.2.0-beta -m "OpenClaw Desktop v0.2.0-beta"
git push origin v0.2.0-beta
```

## 2) GitHub Release Notes Skeleton

```markdown
## OpenClaw Desktop v0.2.0-beta

### Highlights
- Embedded Node.js fallback (prefer system Node.js; fallback to bundled runtime).
- Setup Wizard end-to-end flow (Provider / Agent / Channel).
- Validation Center skeleton (Gateway / Channel / Agent checks).
- One-click diagnostics export for troubleshooting.

### Installer Artifacts
- Windows: `<artifact-name>.exe`, `<artifact-name>.msi`
- macOS: `<artifact-name>.dmg`
- Linux: `<artifact-name>.AppImage` / `.deb`

### Smoke Test Checklist
- [ ] Fresh install launches app successfully.
- [ ] Wizard resumes from existing config correctly.
- [ ] Save/load works for Provider/Agent/Channel.
- [ ] Diagnostics export creates readable file.
- [ ] Gateway start/stop basic flow works.

### Known Limitations
- Auto-install OpenClaw is not included in this beta.
- Onboarding copy and update checker are deferred.

### Upgrade Notes
- Existing users can install over v0.1.0; config files are preserved.

### Feedback Template
Please include:
1. OS + version
2. Repro steps
3. Expected vs actual result
4. Diagnostics export file
```

## 3) Smoke Checklist Links

- Main checklist: `docs/RELEASE_CHECKLIST_v0.2.0-beta.md`
- 10-min workflow log: `docs/TODO_10MIN.md`
- Latest CI success run: https://github.com/buzhangsan/openclaw-desktop/actions/runs/22714348873

## 4) Release Create Command (after artifacts confirmed)

```bash
gh release create v0.2.0-beta \
  --repo buzhangsan/openclaw-desktop \
  --title "OpenClaw Desktop v0.2.0-beta" \
  --notes-file docs/release_notes_v0.2.0-beta.md
```

> Note: create `docs/release_notes_v0.2.0-beta.md` from the skeleton above before running the command.

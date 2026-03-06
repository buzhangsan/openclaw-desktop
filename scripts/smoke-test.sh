#!/usr/bin/env bash
# Smoke test for OpenClaw Desktop build artifacts
# Validates that build produced expected artifacts and they are non-trivial
set -euo pipefail

PLATFORM="${1:-$(uname -s)}"
BUNDLE_DIR="src-tauri/target/release/bundle"
ERRORS=0

log_pass() { echo "✅ PASS: $1"; }
log_fail() { echo "❌ FAIL: $1"; ERRORS=$((ERRORS + 1)); }

check_file_exists() {
  local pattern="$1" label="$2" min_size="${3:-1000}"
  local found
  found=$(find src-tauri/target -name "$pattern" -type f 2>/dev/null | head -1)
  if [ -z "$found" ]; then
    log_fail "$label not found (pattern: $pattern)"
    return
  fi
  local size
  size=$(stat -f%z "$found" 2>/dev/null || stat -c%s "$found" 2>/dev/null || echo 0)
  if [ "$size" -lt "$min_size" ]; then
    log_fail "$label too small: ${size} bytes (min: ${min_size})"
  else
    log_pass "$label found: $found (${size} bytes)"
  fi
}

echo "=== OpenClaw Desktop Smoke Test ==="
echo "Platform: $PLATFORM"
echo ""

# 1. Check frontend built
if [ -d "dist" ] && [ -f "dist/index.html" ]; then
  log_pass "Frontend dist/index.html exists"
else
  log_fail "Frontend dist/index.html missing"
fi

# 2. Check platform-specific artifacts
case "$PLATFORM" in
  Darwin|macos*)
    check_file_exists "*.dmg" "macOS DMG" 5000000
    check_file_exists "*.app" "macOS .app bundle" 1000
    ;;
  Linux|ubuntu*)
    check_file_exists "*.AppImage" "Linux AppImage" 5000000
    check_file_exists "*.deb" "Linux .deb package" 1000000
    ;;
  MINGW*|Windows*|windows*)
    check_file_exists "*.msi" "Windows MSI installer" 1000000
    ;;
  *)
    echo "⚠️  Unknown platform: $PLATFORM, skipping artifact checks"
    ;;
esac

# 3. Check Cargo build succeeded (binary exists)
if [ -f "src-tauri/target/release/openclaw-desktop" ] || \
   [ -f "src-tauri/target/release/openclaw-desktop.exe" ] || \
   find src-tauri/target -path "*/universal-apple-darwin/release/openclaw-desktop" -type f 2>/dev/null | grep -q .; then
  log_pass "Release binary exists"
else
  log_fail "Release binary not found"
fi

# 4. Check tauri.conf.json is valid JSON
if python3 -c "import json; json.load(open('src-tauri/tauri.conf.json'))" 2>/dev/null || \
   node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))" 2>/dev/null; then
  log_pass "tauri.conf.json is valid JSON"
else
  log_fail "tauri.conf.json is invalid"
fi

# 5. Check Rust compilation (cargo check)
echo ""
echo "--- Cargo check ---"
if (cd src-tauri && cargo check 2>&1); then
  log_pass "cargo check succeeded"
else
  log_fail "cargo check failed"
fi

# 6. Check frontend build
echo ""
echo "--- Frontend build check ---"
if npm run build 2>&1; then
  log_pass "npm run build succeeded"
else
  log_fail "npm run build failed"
fi

echo ""
echo "=== Results: $ERRORS error(s) ==="
exit $ERRORS

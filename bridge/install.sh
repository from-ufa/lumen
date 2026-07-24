#!/usr/bin/env bash
# Lumen Bridge installer
# Usage (from Lumen dashboard / docs):
#   curl -fsSL https://raw.githubusercontent.com/from-ufa/lumen/main/bridge/install.sh | bash
#
# Optional env:
#   LUMEN_BRIDGE_RAW    Raw base for bridge files
#                       (default: https://raw.githubusercontent.com/from-ufa/lumen/main/bridge)
#   LUMEN_BASE          Legacy: dashboard origin — if set, uses $LUMEN_BASE/bridge/*
#   LUMEN_BRIDGE_DIR    Install directory (default: ~/lumen-bridge)
#   LUMEN_BRIDGE_TOKEN  If set, prints a ready-to-run start command after install
#   LUMEN_BRIDGE_SERVER WebSocket hub (default: wss://ergolumen.net/ws/bridge)

set -euo pipefail

GH_RAW_DEFAULT="https://raw.githubusercontent.com/from-ufa/lumen/main/bridge"
WS_DEFAULT="wss://ergolumen.net/ws/bridge"

# Prefer explicit raw base; else map legacy LUMEN_BASE → …/bridge; else GitHub.
if [[ -n "${LUMEN_BRIDGE_RAW:-}" ]]; then
  BRIDGE_RAW="${LUMEN_BRIDGE_RAW%/}"
elif [[ -n "${LUMEN_BASE:-}" ]]; then
  BRIDGE_RAW="${LUMEN_BASE%/}/bridge"
else
  BRIDGE_RAW="$GH_RAW_DEFAULT"
fi

DIR="${LUMEN_BRIDGE_DIR:-$HOME/lumen-bridge}"
WS="${LUMEN_BRIDGE_SERVER:-$WS_DEFAULT}"

# Optional: --base URL (legacy) → treat as LUMEN_BASE
if [[ "${1:-}" == "--base" && -n "${2:-}" ]]; then
  BRIDGE_RAW="${2%/}/bridge"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       Lumen Bridge — quick install       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  From:  $BRIDGE_RAW"
echo "  Into:  $DIR"
echo ""

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "✗ Missing dependency: $1"
    echo "  Install Node.js 18+ (includes npm), then re-run."
    exit 1
  fi
}

need curl
need node
need npm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "✗ Node.js 18+ required (found $(node -v 2>/dev/null || echo unknown))"
  exit 1
fi

mkdir -p "$DIR"
cd "$DIR"

echo "→ Downloading bridge.js …"
curl -fsSL "$BRIDGE_RAW/bridge.js" -o bridge.js
echo "→ Downloading package.json …"
curl -fsSL "$BRIDGE_RAW/package.json" -o package.json
if curl -fsSL "$BRIDGE_RAW/package-lock.json" -o package-lock.json 2>/dev/null; then
  echo "→ Downloaded package-lock.json"
else
  rm -f package-lock.json
fi
chmod +x bridge.js

echo "→ npm install (ws) …"
npm install --omit=dev --no-fund --no-audit --loglevel=error

echo ""
echo "✅ Installed in $DIR"
echo ""

if [[ -n "${LUMEN_BRIDGE_TOKEN:-}" ]]; then
  echo "Start Bridge (token from env):"
  echo ""
  echo "  cd $DIR && node bridge.js --token=${LUMEN_BRIDGE_TOKEN} --server=${WS}"
  echo ""
else
  echo "Next step — run Bridge with your token from the Lumen dashboard:"
  echo ""
  echo "  cd $DIR && node bridge.js --token=YOUR_TOKEN --server=${WS}"
  echo ""
  echo "The dashboard shows a ready-made command with your personal token."
  echo ""
fi

echo "Requires a local Ergo node REST at http://127.0.0.1:9053 (override with --node=)."
echo "Source: https://github.com/from-ufa/lumen  ·  Hub: $WS"
echo ""

#!/usr/bin/env bash
# Lumen Bridge installer
# Usage (copy-paste from Lumen dashboard):
#   curl -fsSL http://HOST:3000/bridge/install.sh | bash
#
# Optional env:
#   LUMEN_BASE          Dashboard base URL (default: https://ergolumen.net)
#   LUMEN_BRIDGE_DIR    Install directory (default: ~/lumen-bridge)
#   LUMEN_BRIDGE_TOKEN  If set, prints a ready-to-run start command after install
#   LUMEN_BRIDGE_SERVER WebSocket hub (default: wss://ergolumen.net/ws/bridge)

set -euo pipefail

LUMEN_BASE="${LUMEN_BASE:-https://ergolumen.net}"
LUMEN_BASE="${LUMEN_BASE%/}"
DIR="${LUMEN_BRIDGE_DIR:-$HOME/lumen-bridge}"
WS_DEFAULT="wss://ergolumen.net/ws/bridge"
WS="${LUMEN_BRIDGE_SERVER:-$WS_DEFAULT}"

# If install.sh was saved to disk and executed, try to infer LUMEN_BASE from path (skip for pipe)
if [[ -z "${LUMEN_BASE_SET:-}" && "${1:-}" == "--base" && -n "${2:-}" ]]; then
  LUMEN_BASE="${2%/}"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       Lumen Bridge — quick install       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  From:  $LUMEN_BASE"
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
curl -fsSL "$LUMEN_BASE/bridge/bridge.js" -o bridge.js
echo "→ Downloading package.json …"
curl -fsSL "$LUMEN_BASE/bridge/package.json" -o package.json
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
echo ""

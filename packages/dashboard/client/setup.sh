#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "◆ Installing dashboard client dependencies..."
npm install
echo "◆ Building dashboard client..."
npm run build
echo "✓ Done. Restart the dashboard to see changes."

#!/bin/zsh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "md2html Web UI"
echo "Project: $PROJECT_DIR"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not available. Please install Node.js first."
  echo
  read -r "?Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

port="${PORT:-4576}"
while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
  port=$((port + 1))
done

url="http://localhost:$port"
echo "Opening $url"
echo "Close this Terminal window or press Ctrl+C to stop the Web UI."
echo

echo "Building..."
npm run build

(sleep 2 && open "$url") &
PORT="$port" npm run dev:web

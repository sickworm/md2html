#!/bin/zsh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "md2html CLI"
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

if [ ! -f "packages/cli/dist/index.js" ]; then
  echo "Building CLI..."
  npm run build
fi

echo "Drag a Markdown file here, or paste its full path, then press Enter:"
read -r "?Markdown path: " raw_input
input_file="${(Q)raw_input}"
input_file="${input_file/#\~/$HOME}"

if [ -z "$input_file" ]; then
  echo "Error: empty Markdown path."
  echo
  read -r "?Press Enter to close..."
  exit 1
fi

if [ ! -f "$input_file" ]; then
  echo "Error: file not found: $input_file"
  echo
  read -r "?Press Enter to close..."
  exit 1
fi

base_name="$(basename "$input_file")"
article_name="${base_name%.*}"
output_dir="$PROJECT_DIR/dist/$article_name"

echo
echo "Converting:"
echo "$input_file"
echo

node packages/cli/dist/index.js "$input_file" --platform wechat --theme jugg-clean --toc -o "$output_dir" --open

echo
echo "Done."
echo "Preview HTML:"
echo "$output_dir/$article_name.html"
echo
echo "Inline HTML:"
echo "$output_dir/$article_name.inline.html"
echo
read -r "?Press Enter to close..."


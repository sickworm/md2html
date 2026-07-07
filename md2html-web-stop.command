#!/bin/bash
# md2html-web-stop.command
# 停止所有运行中的 md2html-web 实例
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT_START=4576
PORT_END=4595
KILLED=0

echo "🔍 查找 md2html-web 实例..."

# 方式 1：通过端口查找
for port in $(seq $PORT_START $PORT_END); do
  PIDS=$(lsof -ti TCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    while IFS= read -r pid; do
      CMD=$(ps -p "$pid" -o command= 2>/dev/null || true)
      if echo "$CMD" | grep -q "md2html"; then
        echo "  ⏹  端口 $port → PID $pid (md2html-web)"
        kill "$pid" 2>/dev/null || true
        KILLED=$((KILLED + 1))
      fi
    done <<< "$PIDS"
  fi
done

# 方式 2：通过进程名查找（兜底：非标准端口或进程未监听但仍在运行）
while IFS= read -r pid; do
  # 跳过已处理过的
  if lsof -p "$pid" -a -iTCP -sTCP:LISTEN 2>/dev/null | grep -q ""; then
    # 已在端口扫描中处理，跳过
    continue
  fi
  CMD=$(ps -p "$pid" -o command= 2>/dev/null || true)
  if echo "$CMD" | grep -qE "md2html.*(web|server|tsx.*server\.ts)"; then
    echo "  ⏹  PID $pid (md2html-web, 未监听端口)"
    kill "$pid" 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
done < <(pgrep -f "md2html" 2>/dev/null || true)

if [ "$KILLED" -eq 0 ]; then
  echo "✅ 没有找到运行中的 md2html-web 实例"
else
  echo "✅ 已停止 $KILLED 个实例"
fi

echo ""
echo "按任意键关闭此窗口..."
read -r -n 1

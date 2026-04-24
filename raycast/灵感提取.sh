#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title 灵感提取
# @raycast.mode compact
# @raycast.packageName 许公子工具包
# @raycast.icon 💡
# @raycast.argument1 { "type": "text", "placeholder": "抖音/B站/小红书/YouTube 视频链接" }
# @raycast.description 单条视频 → 下载 → 转写 → 存到你的灵感池

set -uo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

URL="$1"
PLUGIN_ROOT="$HOME/.claude/plugins/xugongzi-lite"
CONFIG="$HOME/.xugongzi-toolkit/config.json"

if [[ ! -f "$CONFIG" || ! -d "$PLUGIN_ROOT" ]]; then
    echo "❌ 许公子工具包没装"
    echo "   先在 Claude Code 里粘许公子的安装指令，装好再用"
    exit 1
fi

# 从剪贴板补一下 URL（如果参数是空的）
[[ -z "$URL" ]] && URL=$(pbpaste 2>/dev/null | head -1)
[[ -z "$URL" ]] && { echo "❌ 没给视频链接"; exit 1; }

# 从 URL 里提取真 URL（处理抖音分享文案）
REAL_URL=$(echo "$URL" | grep -oE 'https?://[A-Za-z0-9._/?=&%#+*-]+' | head -1)
[[ -z "$REAL_URL" ]] && REAL_URL="$URL"

# 读 mode
MODE=$(bash "$PLUGIN_ROOT/scripts/lib/config.sh" get mode 2>/dev/null)
[[ -z "$MODE" ]] && MODE="b"

# 启动后台任务
TASK_ID=$(bash "$PLUGIN_ROOT/scripts/lib/task_log.sh" create "灵感提取" "$REAL_URL")
nohup bash "$PLUGIN_ROOT/scripts/mode_${MODE}/inspiration.sh" "$TASK_ID" "$REAL_URL" > /dev/null 2>&1 &

echo "✅ 已启动"
echo "任务: $TASK_ID"
echo "预计 30s~3min，完成后查看灵感池目录"
echo "查进度：⌥+Space → 任务状态"

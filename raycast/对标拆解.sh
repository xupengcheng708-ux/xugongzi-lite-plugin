#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title 对标拆解
# @raycast.mode compact
# @raycast.packageName 许公子工具包
# @raycast.icon 🎯
# @raycast.argument1 { "type": "text", "placeholder": "对标视频链接" }
# @raycast.description 单条对标视频 → 转写 → 存到拆解池（分析在 Claude Code 里跑）

set -uo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

URL="$1"
PLUGIN_ROOT="$HOME/.claude/plugins/xugongzi-lite"
CONFIG="$HOME/.xugongzi-toolkit/config.json"

if [[ ! -f "$CONFIG" || ! -d "$PLUGIN_ROOT" ]]; then
    echo "❌ 许公子工具包没装"
    echo "   先在 Claude Code 里粘安装指令"
    exit 1
fi

[[ -z "$URL" ]] && URL=$(pbpaste 2>/dev/null | head -1)
[[ -z "$URL" ]] && { echo "❌ 没给视频链接"; exit 1; }

REAL_URL=$(echo "$URL" | grep -oE 'https?://[A-Za-z0-9._/?=&%#+*-]+' | head -1)
[[ -z "$REAL_URL" ]] && REAL_URL="$URL"

MODE=$(bash "$PLUGIN_ROOT/scripts/lib/config.sh" get mode 2>/dev/null)
[[ -z "$MODE" ]] && MODE="b"

REVIEW_DIR=$(bash "$PLUGIN_ROOT/scripts/lib/config.sh" get review_dir 2>/dev/null)

TASK_ID=$(bash "$PLUGIN_ROOT/scripts/lib/task_log.sh" create "对标拆解-抽文案" "$REAL_URL")
nohup bash "$PLUGIN_ROOT/scripts/mode_${MODE}/inspiration.sh" "$TASK_ID" "$REAL_URL" "--target-dir=$REVIEW_DIR" > /dev/null 2>&1 &

echo "✅ 已启动（只抽文案）"
echo "任务: $TASK_ID"
echo "完成后拆解池目录会有 md"
echo "要跑钩子/结构/金句分析：去 Claude Code 说「对标拆解 <该 md 文件>」"

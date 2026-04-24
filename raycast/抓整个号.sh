#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title 抓整个号
# @raycast.mode compact
# @raycast.packageName 许公子工具包
# @raycast.icon 📦
# @raycast.argument1 { "type": "text", "placeholder": "抖音主页分享链接" }
# @raycast.argument2 { "type": "text", "placeholder": "最新几条（默认 10）", "optional": true }
# @raycast.description 抖音主页 → 最新 N 条 → 批量下载转写

set -uo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

HOMEPAGE="$1"
N="${2:-10}"
PLUGIN_ROOT="$HOME/.claude/plugins/xugongzi-lite"
CONFIG="$HOME/.xugongzi-toolkit/config.json"

if [[ ! -f "$CONFIG" || ! -d "$PLUGIN_ROOT" ]]; then
    echo "❌ 许公子工具包没装"
    exit 1
fi

[[ -z "$HOMEPAGE" ]] && HOMEPAGE=$(pbpaste 2>/dev/null | head -1)
[[ -z "$HOMEPAGE" ]] && { echo "❌ 没给主页链接"; exit 1; }

REAL_URL=$(echo "$HOMEPAGE" | grep -oE 'https?://[A-Za-z0-9._/?=&%#+*-]+' | head -1)
[[ -z "$REAL_URL" ]] && REAL_URL="$HOMEPAGE"

MODE=$(bash "$PLUGIN_ROOT/scripts/lib/config.sh" get mode 2>/dev/null)
[[ -z "$MODE" ]] && MODE="b"
ACCOUNT_DIR=$(bash "$PLUGIN_ROOT/scripts/lib/config.sh" get account_dir 2>/dev/null)

# 启动后台任务，自动列出作品 + 按 "最新 N 条" 策略抓
TASK_ID=$(bash "$PLUGIN_ROOT/scripts/lib/task_log.sh" create "抓整个号" "$REAL_URL · 最新${N}条")

# 后台：先 list，然后按最新 N 条抓
nohup bash -c "
    LIST_JSON=/tmp/xgz_list_\$\$.json
    bash '$PLUGIN_ROOT/scripts/mode_${MODE}/account.sh' list '$REAL_URL' \"\$LIST_JSON\" 2>/dev/null
    # 取前 N 条的 id（按默认倒序 = 最新）
    IDS=\$(python3 -c \"import json; d=json.load(open('\$LIST_JSON')); ids = [v.get('aweme_id') or v.get('id') for v in (d.get('videos') or d.get('entries', []))[:$N]]; print(','.join([i for i in ids if i]))\" 2>/dev/null)
    if [[ -n \"\$IDS\" ]]; then
        bash '$PLUGIN_ROOT/scripts/mode_${MODE}/account.sh' download \"\$LIST_JSON\" '$TASK_ID' '$ACCOUNT_DIR' --ids \"\$IDS\" --audio-only
    else
        bash '$PLUGIN_ROOT/scripts/lib/task_log.sh' update '$TASK_ID' failed -
    fi
    rm -f \"\$LIST_JSON\"
" > /dev/null 2>&1 &

echo "✅ 已启动"
echo "任务: $TASK_ID"
echo "策略：最新 $N 条（默认仅文案，省磁盘）"
echo "要挑特定视频？去 Claude Code 说「抓整个号 $REAL_URL」可以交互选片"
echo "查进度：⌥+Space → 任务状态"

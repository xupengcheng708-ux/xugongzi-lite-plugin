#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title 任务状态
# @raycast.mode fullOutput
# @raycast.packageName 许公子工具包
# @raycast.icon 📊
# @raycast.description 查看后台下载/转写任务进度

set -uo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PLUGIN_ROOT="$HOME/.claude/plugins/xugongzi-lite"

if [[ ! -d "$PLUGIN_ROOT" ]]; then
    echo "❌ 许公子工具包没装"
    exit 1
fi

bash "$PLUGIN_ROOT/scripts/lib/task_log.sh" list

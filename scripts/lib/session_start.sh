#!/bin/bash
# session_start.sh - SessionStart hook
# 每次 Claude Code 开启新会话时跑一次。
# 职责：
#   1. 把 plugin.json userConfig 里填的 4 个值同步到 ~/.xugongzi-toolkit/config.json
#      （scripts/* 从这里读配置，解耦 userConfig 机制）
#   2. 轻量依赖检查，缺失就提示（不阻塞会话）
#
# 参数（由 plugin.json hook 注入）:
#   $1 = mode (a|b)
#   $2 = inspiration_dir
#   $3 = review_dir
#   $4 = account_dir
#
# 约定：userConfig 未填时参数值为空字符串或字面量 '${user_config.xxx}'（未替换）

set -uo pipefail  # 故意不加 -e，避免 hook 失败阻塞会话

CONFIG_DIR="$HOME/.xugongzi-toolkit"
CONFIG_FILE="$CONFIG_DIR/config.json"
mkdir -p "$CONFIG_DIR" "$CONFIG_DIR/logs" 2>/dev/null

MODE="${1:-}"
INSP="${2:-}"
REV="${3:-}"
ACC="${4:-}"

# 判断参数是否为未替换的字面量（Claude Code 版本旧 / userConfig 未填）
is_unset() {
    [[ -z "$1" || "$1" == '${user_config.'* ]]
}

# 如果 4 个都没值 → 初次使用，提示跑 /xugongzi-init
if is_unset "$MODE" && is_unset "$INSP" && is_unset "$REV" && is_unset "$ACC"; then
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "💡 许公子工具包已装好，但还没配置。输入：/xugongzi-init"
    fi
    exit 0
fi

# 有值就同步到 config.json（userConfig 是权威源）
if command -v jq >/dev/null 2>&1; then
    # 展开 ~
    INSP="${INSP/#\~/$HOME}"
    REV="${REV/#\~/$HOME}"
    ACC="${ACC/#\~/$HOME}"

    mkdir -p "$INSP" "$REV" "$ACC" 2>/dev/null

    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq -n \
        --arg mode "$MODE" \
        --arg insp "$INSP" \
        --arg rev "$REV" \
        --arg acc "$ACC" \
        --arg now "$now" \
        '{mode:$mode, inspiration_dir:$insp, review_dir:$rev, account_dir:$acc, updated_at:$now, source:"userConfig"}' \
        > "$CONFIG_FILE" 2>/dev/null
fi

# 轻量依赖检查（只提示缺失项，不阻塞）
missing=()
command -v jq >/dev/null 2>&1      || missing+=("jq")
command -v ffmpeg >/dev/null 2>&1  || missing+=("ffmpeg")
command -v yt-dlp >/dev/null 2>&1  || missing+=("yt-dlp")
command -v python3 >/dev/null 2>&1 || missing+=("python3")

if [[ "$MODE" == "a" ]]; then
    command -v mlx_whisper >/dev/null 2>&1 || missing+=("mlx-whisper")
elif [[ "$MODE" == "b" ]]; then
    python3 -c "import whisper" 2>/dev/null || missing+=("openai-whisper")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "⚠️  许公子工具包缺依赖：${missing[*]}"
    echo "    → 装依赖指引：/xugongzi-init（会列出安装命令）"
fi

exit 0

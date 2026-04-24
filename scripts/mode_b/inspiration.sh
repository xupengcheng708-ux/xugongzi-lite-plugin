#!/bin/bash
# mode_b/inspiration.sh - 单条视频下载+转写（路线 B：yt-dlp + openai-whisper）
# 用法: inspiration.sh <TASK_ID> <URL> [--target-dir <path>]

set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
TASK_LOG="$LIB_DIR/task_log.sh"
CONFIG="$LIB_DIR/config.sh"
FORMAT_SRT="$LIB_DIR/format_srt.py"

TASK_ID="$1"
URL="$2"
shift 2

TARGET_DIR=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --target-dir=*) TARGET_DIR="${1#*=}"; shift ;;
        --target-dir)   TARGET_DIR="$2"; shift 2 ;;
        *) shift ;;
    esac
done

[[ -z "$TARGET_DIR" ]] && TARGET_DIR=$(bash "$CONFIG" get inspiration_dir)
[[ -z "$TARGET_DIR" ]] && { echo "ERROR: 无法确定目标目录" >&2; exit 1; }

LOG_FILE="$HOME/.xugongzi-toolkit/logs/$TASK_ID.log"
log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; bash "$TASK_LOG" update "$TASK_ID" failed "-"; exit 1; }

trap 'fail "脚本异常退出"' ERR

# Step 1: 识别平台
if   echo "$URL" | grep -qE 'douyin\.com';              then PLATFORM="抖音"
elif echo "$URL" | grep -qE 'b23\.tv|bilibili\.com';    then PLATFORM="B站"
elif echo "$URL" | grep -qE 'xhslink|xiaohongshu';      then PLATFORM="小红书"
elif echo "$URL" | grep -qE 'youtu\.be|youtube\.com';   then PLATFORM="YouTube"
else                                                         PLATFORM="其他"
fi
log "平台: $PLATFORM | URL: $URL"

bash "$TASK_LOG" update "$TASK_ID" running "10"

TMPDIR=$(mktemp -d -t xgz_insp_XXXXXX)

# Step 2: 尝试抓字幕
log "尝试下载字幕..."
yt-dlp --write-subs --write-auto-subs \
    --sub-lang "zh-Hans,zh-CN,zh,en" \
    --skip-download --convert-subs srt \
    -o "$TMPDIR/video" "$URL" 2>&1 | tee -a "$LOG_FILE" >/dev/null || true

SRT_FILE=$(find "$TMPDIR" -name "*.srt" 2>/dev/null | head -1)
METHOD=""
VIDEO_FILE=""

if [[ -n "$SRT_FILE" ]]; then
    METHOD="subtitle"
    log "✓ 平台字幕可用"
else
    log "无字幕，下载视频..."
    bash "$TASK_LOG" update "$TASK_ID" running "30"
    VIDEO_FILE="$TMPDIR/video.mp4"
    yt-dlp -f "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best" \
        -o "$VIDEO_FILE" "$URL" 2>&1 | tee -a "$LOG_FILE" >/dev/null || fail "yt-dlp 下载失败"

    [[ ! -f "$VIDEO_FILE" ]] && fail "下载后找不到 mp4"

    bash "$TASK_LOG" update "$TASK_ID" running "50"
    log "openai-whisper 转写（base 模型 ≈ 1x 实时）..."

    python3 -m whisper "$VIDEO_FILE" --language zh --model base \
        --output_format srt --output_dir "$TMPDIR" \
        2>&1 | tee -a "$LOG_FILE" >/dev/null || fail "whisper 转写失败"

    SRT_FILE=$(find "$TMPDIR" -name "*.srt" | head -1)
    [[ -z "$SRT_FILE" ]] && fail "whisper 未产出 SRT"
    METHOD="whisper"
fi

bash "$TASK_LOG" update "$TASK_ID" running "80"

# Step 3: 获取标题
TITLE=$(yt-dlp --get-title "$URL" 2>/dev/null | head -1)
[[ -z "$TITLE" ]] && TITLE="视频_$(date +%Y%m%d_%H%M%S)"

# 清洗标题用作文件名（去掉文件系统非法字符 + Obsidian 语法字符）
SAFE_TITLE=$(echo "$TITLE" | tr '/\\:*?"<>|#^[]' '_' | cut -c1-60)
DATE=$(date +%Y-%m-%d)
OUT_FILE="$TARGET_DIR/${DATE}-${SAFE_TITLE}.md"
[[ -f "$OUT_FILE" ]] && OUT_FILE="$TARGET_DIR/${DATE}-${SAFE_TITLE}-$(date +%H%M%S).md"

# Step 4: 格式化 + 写 md
log "格式化文案..."
FORMATTED=$(python3 "$FORMAT_SRT" "$SRT_FILE" 2>/dev/null || cat "$SRT_FILE")

mkdir -p "$TARGET_DIR"
cat > "$OUT_FILE" <<EOF
---
标题: $TITLE
平台: $PLATFORM
链接: $URL
提取时间: $(date '+%Y-%m-%d %H:%M')
方式: $METHOD
状态: 已提取
任务ID: $TASK_ID
---

# $TITLE

## 📄 原始文案

$FORMATTED
EOF

log "✓ 写入 $OUT_FILE"
bash "$TASK_LOG" update "$TASK_ID" done "100"

rm -rf "$TMPDIR"
trap - ERR
log "任务完成"

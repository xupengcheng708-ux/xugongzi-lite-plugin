#!/bin/bash
# mode_a/inspiration.sh - 单条视频下载+转写（路线 A：douyin-toolkit + mlx_whisper）
# 用法: inspiration.sh <TASK_ID> <URL> [--target-dir <path>] [--language zh|en|auto] [--note "..."] [--keep-media]

set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
TASK_LOG="$LIB_DIR/task_log.sh"
CONFIG="$LIB_DIR/config.sh"
FORMAT_SRT="$LIB_DIR/format_srt.py"

DT_DIR="$HOME/bin/douyin-toolkit"
PY_VENV="$HOME/bin/.venv/bin/python3"

TASK_ID="$1"
URL="$2"
shift 2

TARGET_DIR=""
LANGUAGE="zh"
NOTE=""
KEEP_MEDIA=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --target-dir=*) TARGET_DIR="${1#*=}"; shift ;;
        --target-dir)   TARGET_DIR="$2"; shift 2 ;;
        --language=*)   LANGUAGE="${1#*=}"; shift ;;
        --language)     LANGUAGE="$2"; shift 2 ;;
        --note=*)       NOTE="${1#*=}"; shift ;;
        --note)         NOTE="$2"; shift 2 ;;
        --keep-media)   KEEP_MEDIA=1; shift ;;
        *) shift ;;
    esac
done

[[ -z "$TARGET_DIR" ]] && TARGET_DIR=$(bash "$CONFIG" get inspiration_dir)
[[ -z "$TARGET_DIR" ]] && { echo "ERROR: 无法确定目标目录" >&2; exit 1; }

LOG_FILE="$HOME/.xugongzi-toolkit/logs/$TASK_ID.log"
# 写两份：log 文件带时间戳；stderr 带 INFO: 前缀供 Raycast Extension 实时读取
log() {
    local msg="$*"
    echo "[$(date '+%H:%M:%S')] $msg" >> "$LOG_FILE"
    echo "INFO: $msg" >&2
}
fail() { log "ERROR: $*"; bash "$TASK_LOG" update "$TASK_ID" failed "-"; exit 1; }

trap 'fail "脚本异常退出"' ERR

# 识别平台
if   echo "$URL" | grep -qE 'douyin\.com';              then PLATFORM="抖音"
elif echo "$URL" | grep -qE 'b23\.tv|bilibili\.com';    then PLATFORM="B站"
elif echo "$URL" | grep -qE 'xhslink|xiaohongshu';      then PLATFORM="小红书"
elif echo "$URL" | grep -qE 'youtu\.be|youtube\.com';   then PLATFORM="YouTube"
else                                                         PLATFORM="其他"
fi
log "平台: $PLATFORM | URL: $URL"

bash "$TASK_LOG" update "$TASK_ID" running "10"

TMPDIR=$(mktemp -d -t xgz_insp_XXXXXX)
SRT_FILE=""
VIDEO_FILE=""
METHOD=""
TITLE=""

if [[ "$PLATFORM" == "抖音" ]]; then
    # 路线 A 的抖音走 douyin-toolkit
    [[ ! -x "$PY_VENV" ]]            && fail "~/bin/.venv 未配置，见 INSTALL.md 路线 A"
    [[ ! -f "$DT_DIR/download_single.py" ]] && fail "~/bin/douyin-toolkit/ 未安装，见 INSTALL.md 路线 A"

    log "douyin-toolkit 下载..."
    DY_STDOUT=$(mktemp)
    "$PY_VENV" "$DT_DIR/download_single.py" "$URL" --out "$TMPDIR" 2> >(tee -a "$LOG_FILE" >&2) > "$DY_STDOUT" || fail "douyin-toolkit 失败"

    VIDEO_FILE=$(grep '^VIDEO:' "$DY_STDOUT" | sed 's/^VIDEO://')
    TITLE=$(grep '^TITLE:' "$DY_STDOUT" | sed 's/^TITLE://')
    rm -f "$DY_STDOUT"

    [[ ! -f "$VIDEO_FILE" ]] && fail "mp4 找不到: $VIDEO_FILE"
    METHOD="whisper"
else
    # 其他平台走 yt-dlp 字幕 → 视频
    case "$LANGUAGE" in
        en)   SUB_LANG="en,en-US" ;;
        auto) SUB_LANG="zh-Hans,zh-CN,zh,en,en-US" ;;
        *)    SUB_LANG="zh-Hans,zh-CN,zh" ;;
    esac
    log "尝试抓字幕（lang=$LANGUAGE）..."
    yt-dlp --write-subs --write-auto-subs --sub-lang "$SUB_LANG" \
        --skip-download --convert-subs srt -o "$TMPDIR/video" "$URL" 2>&1 | tee -a "$LOG_FILE" >/dev/null || true

    SRT_FILE=$(find "$TMPDIR" -name "*.srt" 2>/dev/null | head -1)
    TITLE=$(yt-dlp --get-title "$URL" 2>/dev/null | head -1)
    [[ -z "$TITLE" ]] && TITLE="视频_$(date +%Y%m%d_%H%M%S)"

    if [[ -n "$SRT_FILE" ]]; then
        METHOD="subtitle"
        log "✓ 平台字幕可用"
    else
        log "下载视频..."
        VIDEO_FILE="$TMPDIR/video.mp4"
        yt-dlp -f "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best" \
            -o "$VIDEO_FILE" "$URL" 2>&1 | tee -a "$LOG_FILE" >/dev/null || fail "yt-dlp 失败"
        METHOD="whisper"
    fi
fi

bash "$TASK_LOG" update "$TASK_ID" running "50"

# 如果没有字幕，跑 mlx_whisper
if [[ -z "$SRT_FILE" ]]; then
    command -v mlx_whisper >/dev/null || fail "mlx_whisper 未安装。pip3 install mlx-whisper"
    log "mlx_whisper 转写（large-v3-turbo，lang=$LANGUAGE）..."

    MLX_LANG_ARGS=""
    if [[ "$LANGUAGE" != "auto" ]]; then
        MLX_LANG_ARGS="--language $LANGUAGE"
    fi
    mlx_whisper "$VIDEO_FILE" --model mlx-community/whisper-large-v3-turbo \
        --output-format srt --output-dir "$TMPDIR" $MLX_LANG_ARGS \
        2>&1 | tee -a "$LOG_FILE" >/dev/null || fail "mlx_whisper 失败"

    SRT_FILE=$(find "$TMPDIR" -name "*.srt" | head -1)
    [[ -z "$SRT_FILE" ]] && fail "mlx_whisper 未产出 SRT"
fi

bash "$TASK_LOG" update "$TASK_ID" running "80"

# 写 md
SAFE_TITLE=$(echo "$TITLE" | tr '/\\:*?"<>|#^[]' '_' | cut -c1-60)
DATE=$(date +%Y-%m-%d)
OUT_FILE="$TARGET_DIR/${DATE}-${SAFE_TITLE}.md"
[[ -f "$OUT_FILE" ]] && OUT_FILE="$TARGET_DIR/${DATE}-${SAFE_TITLE}-$(date +%H%M%S).md"

FORMATTED=$(python3 "$FORMAT_SRT" "$SRT_FILE" 2>/dev/null || cat "$SRT_FILE")

mkdir -p "$TARGET_DIR"

NOTE_SECTION=""
if [[ -n "$NOTE" ]]; then
    NOTE_SECTION=$'\n## 📝 备注\n\n'"$NOTE"$'\n'
fi

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
$NOTE_SECTION
## 📄 原始文案

$FORMATTED
EOF

log "✓ 写入 $OUT_FILE"
bash "$TASK_LOG" update "$TASK_ID" done "100"

if [[ "$KEEP_MEDIA" == "1" ]]; then
    log "视频保留在 $TMPDIR/"
else
    rm -rf "$TMPDIR"
fi
trap - ERR
log "任务完成"
# stdout 输出结果供 Raycast Extension 解析
echo "OUT_FILE:$OUT_FILE"
echo "METHOD:$METHOD"
echo "TITLE:$TITLE"

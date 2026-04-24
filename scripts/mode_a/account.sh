#!/bin/bash
# mode_a/account.sh - 主页批量抓取（路线 A：douyin-toolkit + mlx_whisper）
# 用法:
#   account.sh list <HOMEPAGE_URL> <OUT_JSON>
#   account.sh download <LIST_JSON> <TASK_ID> <TARGET_DIR> --ids <a,b,c> [--audio-only|--keep-video]

set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
TASK_LOG="$LIB_DIR/task_log.sh"

DT_DIR="$HOME/bin/douyin-toolkit"
PY_VENV="$HOME/bin/.venv/bin/python3"

check_env() {
    [[ ! -d "$DT_DIR" ]]   && { echo "ERROR: ~/bin/douyin-toolkit/ 未安装，见 INSTALL.md" >&2; exit 1; }
    [[ ! -x "$PY_VENV" ]] && { echo "ERROR: ~/bin/.venv 未配置，见 INSTALL.md" >&2; exit 1; }
}

cmd_list() {
    check_env
    local url="$1" out="$2"
    "$PY_VENV" "$DT_DIR/list_videos.py" "$url" --out "$out" 2>&1 >/dev/null || { echo "ERROR: list_videos 失败" >&2; exit 1; }

    "$PY_VENV" - <<EOF
import json
d = json.load(open("$out"))
nickname = d.get("nickname", "未知账号")
total = d.get("count", 0)
matched = d.get("matched_account", None)
print(f"OK: {nickname} · {total} 条作品 · matched={matched}")
print()
print("前 30 条（按发布时间倒序）：")
for i, v in enumerate(d.get("videos", [])[:30], 1):
    ct = v.get("create_time", "?")
    dg = v.get("digg_count", 0)
    cm = v.get("comment_count", 0)
    desc = (v.get("desc") or "")[:40]
    print(f"  {i}. {ct} | {dg:>5}赞 {cm:>3}评 | {desc}")
EOF
}

cmd_download() {
    check_env
    local listjson="$1" task_id="$2" target_dir="$3"
    shift 3

    local ids="" audio_flag=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --ids=*)       ids="${1#*=}"; shift ;;
            --ids)         ids="$2"; shift 2 ;;
            --audio-only)  audio_flag="--audio-only"; shift ;;
            --keep-video)  audio_flag=""; shift ;;
            *) shift ;;
        esac
    done

    local log_file="$HOME/.xugongzi-toolkit/logs/$task_id.log"
    exec > >(tee -a "$log_file") 2>&1

    local nick
    nick=$("$PY_VENV" -c "import json; print(json.load(open('$listjson')).get('nickname','未知'))")
    local safe_nick
    safe_nick=$(echo "$nick" | tr '/\\:*?"<>|#^[]' '_')
    local out_dir="$target_dir/$safe_nick"
    mkdir -p "$out_dir"

    local dl_out="$HOME/Downloads/xugongzi-dl/$safe_nick"
    mkdir -p "$dl_out"

    echo "[$(date +%H:%M:%S)] 批量下载 $nick → $dl_out"
    bash "$TASK_LOG" update "$task_id" running "10"

    "$PY_VENV" "$DT_DIR/download_by_ids.py" "$listjson" \
        --ids "$ids" --out "$dl_out" $audio_flag 2>&1

    local manifest="$dl_out/_manifest.json"
    [[ ! -f "$manifest" ]] && { echo "ERROR: manifest 未生成"; bash "$TASK_LOG" update "$task_id" failed "-"; exit 1; }

    echo "[$(date +%H:%M:%S)] 批量转写 + 归档..."
    bash "$TASK_LOG" update "$task_id" running "40"

    export XGZ_TASK_LOG="$TASK_LOG"
    "$PY_VENV" "$SCRIPT_DIR/archive_batch.py" "$manifest" "$out_dir" "$task_id" 2>&1 || {
        bash "$TASK_LOG" update "$task_id" failed "-"
        exit 1
    }

    # 生成索引
    echo "[$(date +%H:%M:%S)] 生成索引..."
    {
        echo "---"
        echo "账号: $nick"
        echo "抓取时间: $(date '+%Y-%m-%d %H:%M')"
        echo "---"
        echo ""
        echo "# $nick · 抓取索引"
        echo ""
        echo "| 发布日期 | 标题 | 点赞 | 文件 |"
        echo "|---|---|---|---|"
        for f in "$out_dir"/*.md; do
            [[ "$(basename "$f")" == "_索引.md" ]] && continue
            [[ ! -f "$f" ]] && continue
            local t d l
            t=$(grep '^标题:'     "$f" | head -1 | sed 's/^标题: //')
            d=$(grep '^发布时间:' "$f" | head -1 | sed 's/^发布时间: //')
            l=$(grep '^点赞:'     "$f" | head -1 | sed 's/^点赞: //')
            echo "| $d | $t | $l | [[$(basename "$f" .md)]] |"
        done
    } > "$out_dir/_索引.md"

    bash "$TASK_LOG" update "$task_id" done "100"
    echo "[$(date +%H:%M:%S)] 完成，归档在 $out_dir"
}

case "${1:-}" in
    list)     shift; cmd_list "$@" ;;
    download) shift; cmd_download "$@" ;;
    *) echo "用法: $0 {list|download}" >&2; exit 1 ;;
esac

#!/bin/bash
# mode_b/account.sh - 主页批量抓取（路线 B：yt-dlp）
# 用法:
#   account.sh list <HOMEPAGE_URL> <OUT_JSON>
#   account.sh download <LIST_JSON> <TASK_ID> <TARGET_DIR> --ids <a,b,c> [--audio-only|--keep-video]

set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
INSP_SCRIPT="$SCRIPT_DIR/inspiration.sh"
TASK_LOG="$LIB_DIR/task_log.sh"

cmd_list() {
    local url="$1" out="$2"
    echo "INFO: 抓主页列表（yt-dlp --flat-playlist）..." >&2
    yt-dlp --flat-playlist --dump-single-json "$url" > "$out" 2>/dev/null || {
        echo "ERROR: yt-dlp 拉列表失败（抖音某些主页需要登录 cookie；路线 B 限制）" >&2
        exit 1
    }
    local n nick
    n=$(jq '.entries | length' "$out")
    nick=$(jq -r '.uploader // .channel // .title // "未知账号"' "$out")
    echo "OK: $nick · $n 条作品"
    echo ""
    echo "前 30 条（路线 B 拿不到点赞/评论数）："
    jq -r '.entries[0:30] | to_entries | .[] | "  \(.key+1). \(.value.upload_date // "?") | \(.value.id // "?") | \(.value.title[0:50] // "?")"' "$out" 2>/dev/null
}

cmd_download() {
    local listjson="$1" task_id="$2" target_dir="$3"
    shift 3

    local ids=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --ids=*)      ids="${1#*=}"; shift ;;
            --ids)        ids="$2"; shift 2 ;;
            --audio-only) shift ;;   # 路线 B 始终按 audio-only 处理（yt-dlp 下完就转写，不留视频）
            --keep-video) shift ;;
            *) shift ;;
        esac
    done

    local log_file="$HOME/.xugongzi-toolkit/logs/$task_id.log"
    exec > >(tee -a "$log_file") 2>&1

    local nick
    nick=$(jq -r '.uploader // .channel // "未知账号"' "$listjson")
    local safe_nick
    safe_nick=$(echo "$nick" | tr '/\\:*?"<>|#^[]' '_')
    local out_dir="$target_dir/$safe_nick"
    mkdir -p "$out_dir"

    echo "[$(date +%H:%M:%S)] 批量下载 → $out_dir"

    IFS=',' read -ra ID_ARR <<< "$ids"
    local total=${#ID_ARR[@]}
    local done_count=0

    for id in "${ID_ARR[@]}"; do
        done_count=$((done_count + 1))
        bash "$TASK_LOG" update "$task_id" running "$done_count/$total"

        local entry_url
        entry_url=$(jq -r --arg id "$id" '.entries[] | select(.id == $id) | (.url // .webpage_url // "")' "$listjson" | head -1)
        [[ -z "$entry_url" ]] && { echo "SKIP: id=$id 在列表里找不到 URL"; continue; }

        local sub_task="${task_id}-sub-${done_count}"
        bash "$INSP_SCRIPT" "$sub_task" "$entry_url" --target-dir="$out_dir" || {
            echo "[$(date +%H:%M:%S)] FAIL $done_count/$total: $entry_url"
            continue
        }
        echo "[$(date +%H:%M:%S)] ✓ $done_count/$total"
    done

    # 生成索引
    echo "[$(date +%H:%M:%S)] 生成索引..."
    {
        echo "---"
        echo "账号: $nick"
        echo "抓取时间: $(date '+%Y-%m-%d %H:%M')"
        echo "样本数量: $done_count"
        echo "---"
        echo ""
        echo "# $nick · 抓取索引"
        echo ""
        echo "| 发布日期 | 标题 | 文件 |"
        echo "|---|---|---|"
        for f in "$out_dir"/*.md; do
            [[ "$(basename "$f")" == "_索引.md" ]] && continue
            [[ ! -f "$f" ]] && continue
            local t d
            t=$(grep '^标题:'     "$f" | head -1 | sed 's/^标题: //')
            d=$(grep '^提取时间:' "$f" | head -1 | sed 's/^提取时间: //')
            echo "| $d | $t | [[$(basename "$f" .md)]] |"
        done
    } > "$out_dir/_索引.md"

    bash "$TASK_LOG" update "$task_id" done "100"
    echo "[$(date +%H:%M:%S)] 完成"
}

case "${1:-}" in
    list)     shift; cmd_list "$@" ;;
    download) shift; cmd_download "$@" ;;
    *) echo "用法: $0 {list|download}" >&2; exit 1 ;;
esac

#!/bin/bash
# task_log.sh - 后台任务管理
# 用法:
#   task_log.sh create <type> <args>              返回 TASK_ID（写到 stdout）
#   task_log.sh update <id> <status> [progress]   更新任务状态
#   task_log.sh list [count]                       列出最近 count 条任务
#   task_log.sh wait <id> [--timeout <sec>]        阻塞等待任务结束
#   task_log.sh log <id>                           显示任务日志内容
#   task_log.sh clean                              清理 24h+ 的完成任务

set -euo pipefail

CONFIG_DIR="$HOME/.xugongzi-toolkit"
TASKS_FILE="$CONFIG_DIR/tasks.log"
LOGS_DIR="$CONFIG_DIR/logs"

mkdir -p "$CONFIG_DIR" "$LOGS_DIR"
touch "$TASKS_FILE"

ensure_jq() {
    command -v jq >/dev/null 2>&1 || {
        echo "ERROR: 需要 jq。brew install jq" >&2
        exit 1
    }
}

gen_id() {
    local rand
    rand=$(openssl rand -hex 3 2>/dev/null || printf '%06x' $RANDOM)
    echo "xgz-$(date +%Y%m%d-%H%M%S)-$rand"
}

now_iso() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

cmd_create() {
    ensure_jq
    local type="$1" args="$2"
    local id
    id=$(gen_id)
    local now
    now=$(now_iso)
    local log_file="$LOGS_DIR/$id.log"
    touch "$log_file"

    jq -cn --arg id "$id" --arg type "$type" --arg args "$args" \
           --arg started "$now" --arg updated "$now" --arg log "$log_file" \
           '{id:$id,type:$type,args:$args,status:"running",progress:"0",started:$started,updated:$updated,log:$log}' \
        >> "$TASKS_FILE"

    echo "$id"
}

cmd_update() {
    ensure_jq
    local id="$1" status="$2" progress="${3:-}"
    local tmp
    tmp=$(mktemp)
    local now
    now=$(now_iso)

    jq -c --arg id "$id" --arg status "$status" --arg progress "$progress" --arg now "$now" \
        'if .id == $id then
            .status = $status | .updated = $now |
            (if $progress != "" then .progress = $progress else . end)
         else . end' \
        "$TASKS_FILE" > "$tmp"
    mv "$tmp" "$TASKS_FILE"
}

cmd_list() {
    ensure_jq
    local count="${1:-20}"

    if [[ ! -s "$TASKS_FILE" ]]; then
        echo "（暂无任务）"
        return
    fi

    printf "%-8s  %-32s  %-16s  %-10s  %s\n" "状态" "任务ID" "类型" "进度" "参数"
    echo "──────────────────────────────────────────────────────────────────────────────────"

    # 倒序取最后 count 条
    tail -n "$count" "$TASKS_FILE" | (tail -r 2>/dev/null || sed -n '1!G;h;$p') | while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local id type status progress args
        id=$(echo "$line"       | jq -r '.id // "?"')
        type=$(echo "$line"     | jq -r '.type // "?"')
        status=$(echo "$line"   | jq -r '.status // "?"')
        progress=$(echo "$line" | jq -r '.progress // "?"')
        args=$(echo "$line"     | jq -r '.args // "?"')

        local icon
        case "$status" in
            running) icon="🟢 跑中" ;;
            done)    icon="✅ 完成" ;;
            failed)  icon="❌ 失败" ;;
            *)       icon="⚪ $status" ;;
        esac

        # 截断 args
        local args_short="${args:0:50}"
        [[ ${#args} -gt 50 ]] && args_short="${args_short}..."

        printf "%-8s  %-32s  %-16s  %-10s  %s\n" "$icon" "$id" "$type" "$progress" "$args_short"
    done
}

cmd_wait() {
    ensure_jq
    local id="$1"
    shift
    local timeout=600
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --timeout) timeout="$2"; shift 2 ;;
            --timeout=*) timeout="${1#*=}"; shift ;;
            *) shift ;;
        esac
    done

    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        local status
        status=$(grep -F "\"id\":\"$id\"" "$TASKS_FILE" | tail -1 | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
        case "$status" in
            done|failed) echo "$status"; return 0 ;;
            unknown)     echo "ERROR: 任务不存在 $id" >&2; return 1 ;;
        esac
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo "ERROR: 超时" >&2
    return 1
}

cmd_log() {
    local id="$1"
    local log_file="$LOGS_DIR/$id.log"
    [[ -f "$log_file" ]] && cat "$log_file" || echo "（无日志）"
}

cmd_clean() {
    ensure_jq
    local tmp
    tmp=$(mktemp)
    local cutoff
    cutoff=$(date -u -v-1d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '1 day ago' +"%Y-%m-%dT%H:%M:%SZ")

    # 保留：running 或 更新时间 > cutoff
    jq -c --arg cutoff "$cutoff" \
        'select(.status == "running" or .updated > $cutoff)' \
        "$TASKS_FILE" > "$tmp"
    mv "$tmp" "$TASKS_FILE"
    echo "OK: 已清理 1 天前的完成任务"
}

case "${1:-}" in
    create)  shift; cmd_create "$@" ;;
    update)  shift; cmd_update "$@" ;;
    list)    shift; cmd_list "$@" ;;
    wait)    shift; cmd_wait "$@" ;;
    log)     shift; cmd_log "$@" ;;
    clean)   cmd_clean ;;
    *)       echo "用法: $0 {create|update|list|wait|log|clean}" >&2; exit 1 ;;
esac

#!/bin/bash
# config.sh - 配置管理
# 用法:
#   config.sh init --mode <a|b> --inspiration-dir <path> --review-dir <path> --account-dir <path>
#   config.sh get <key>
#   config.sh set <key> <value>
#   config.sh path

set -euo pipefail

CONFIG_DIR="$HOME/.xugongzi-toolkit"
CONFIG_FILE="$CONFIG_DIR/config.json"

ensure_jq() {
    command -v jq >/dev/null 2>&1 || {
        echo "ERROR: 需要 jq。macOS: brew install jq | Linux: apt install jq" >&2
        exit 1
    }
}

expand_path() {
    # 展开 ~ 和环境变量
    local p="$1"
    eval echo "$p"
}

cmd_init() {
    local mode="" insp="" rev="" acc=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode) mode="$2"; shift 2 ;;
            --inspiration-dir) insp="$2"; shift 2 ;;
            --review-dir) rev="$2"; shift 2 ;;
            --account-dir) acc="$2"; shift 2 ;;
            *) echo "未知参数: $1" >&2; exit 1 ;;
        esac
    done

    [[ -z "$mode" ]] && { echo "ERROR: --mode 必填 (a|b)" >&2; exit 1; }
    [[ "$mode" != "a" && "$mode" != "b" ]] && { echo "ERROR: mode 只能是 a 或 b" >&2; exit 1; }
    [[ -z "$insp" || -z "$rev" || -z "$acc" ]] && { echo "ERROR: 三个目录路径都必填" >&2; exit 1; }

    insp=$(expand_path "$insp")
    rev=$(expand_path "$rev")
    acc=$(expand_path "$acc")

    mkdir -p "$CONFIG_DIR" "$CONFIG_DIR/logs"
    mkdir -p "$insp" "$rev" "$acc"

    ensure_jq
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq -n --arg mode "$mode" --arg insp "$insp" --arg rev "$rev" --arg acc "$acc" --arg now "$now" \
        '{mode:$mode, inspiration_dir:$insp, review_dir:$rev, account_dir:$acc, created_at:$now, updated_at:$now}' \
        > "$CONFIG_FILE"

    echo "OK: 配置已写入 $CONFIG_FILE"
    echo "  mode:            $mode"
    echo "  inspiration_dir: $insp"
    echo "  review_dir:      $rev"
    echo "  account_dir:     $acc"
}

cmd_get() {
    [[ ! -f "$CONFIG_FILE" ]] && { echo "ERROR: 配置未初始化，先跑 /xugongzi-init" >&2; exit 1; }
    ensure_jq
    jq -r ".$1 // empty" "$CONFIG_FILE"
}

cmd_set() {
    [[ ! -f "$CONFIG_FILE" ]] && { echo "ERROR: 配置未初始化" >&2; exit 1; }
    ensure_jq
    local key="$1" value="$2"
    local tmp
    tmp=$(mktemp)
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg k "$key" --arg v "$value" --arg now "$now" \
        '.[$k] = $v | .updated_at = $now' "$CONFIG_FILE" > "$tmp"
    mv "$tmp" "$CONFIG_FILE"
    echo "OK: $key = $value"
}

case "${1:-}" in
    init)  shift; cmd_init "$@" ;;
    get)   shift; cmd_get "$@" ;;
    set)   shift; cmd_set "$@" ;;
    path)  echo "$CONFIG_FILE" ;;
    *)     echo "用法: $0 {init|get|set|path}" >&2; exit 1 ;;
esac

#!/bin/bash
# check_deps.sh - 依赖检测
# 用法:
#   check_deps.sh detect-hardware       输出 apple-silicon | intel-mac | linux | other
#   check_deps.sh check [mode]          按 mode (a|b) 检测依赖；mode 缺省时读 config

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cmd_detect_hardware() {
    local os arch
    os=$(uname -s)
    arch=$(uname -m)
    if [[ "$os" == "Darwin" ]]; then
        if [[ "$arch" == "arm64" ]]; then
            echo "apple-silicon"
        else
            echo "intel-mac"
        fi
    elif [[ "$os" == "Linux" ]]; then
        echo "linux"
    else
        echo "other:$os/$arch"
    fi
}

cmd_check() {
    local mode="${1:-}"
    if [[ -z "$mode" ]]; then
        mode=$(bash "$SCRIPT_DIR/config.sh" get mode 2>/dev/null || echo "")
    fi

    local missing=()
    local warnings=()

    # 共用依赖
    command -v jq >/dev/null        || missing+=("jq          — macOS: brew install jq")
    command -v ffmpeg >/dev/null    || missing+=("ffmpeg      — macOS: brew install ffmpeg")
    command -v python3 >/dev/null   || missing+=("python3     — macOS: brew install python3")
    command -v yt-dlp >/dev/null    || missing+=("yt-dlp      — macOS: brew install yt-dlp")

    if [[ "$mode" == "a" ]]; then
        # 路线 A：Apple Silicon + douyin-toolkit + mlx_whisper
        local hw
        hw=$(cmd_detect_hardware)
        [[ "$hw" != "apple-silicon" ]] && \
            warnings+=("当前硬件: $hw —— 路线 A 需要 Apple Silicon Mac（M1/M2/M3/M4）")

        command -v mlx_whisper >/dev/null || \
            missing+=("mlx_whisper — pip3 install mlx-whisper")

        [[ -d "$HOME/bin/douyin-toolkit" ]] || \
            missing+=("~/bin/douyin-toolkit/ 不存在 —— 见 INSTALL.md 路线 A 步骤 3")

        [[ -x "$HOME/bin/.venv/bin/python3" ]] || \
            missing+=("~/bin/.venv Python 虚拟环境不存在 —— 见 INSTALL.md 路线 A 步骤 4")

        if [[ -x "$HOME/bin/.venv/bin/python3" ]]; then
            "$HOME/bin/.venv/bin/python3" -c "import f2" 2>/dev/null || \
                missing+=("f2 库未装 —— ~/bin/.venv/bin/pip install f2")
        fi

        [[ -f "$HOME/Applications/TikTokDownloader/_internal/Volume/settings.json" ]] || \
            warnings+=("DouK cookie 未配置 —— 首次抓抖音必须（见 INSTALL.md 路线 A 步骤 5）")

    elif [[ "$mode" == "b" ]]; then
        # 路线 B：yt-dlp + openai-whisper
        python3 -c "import whisper" 2>/dev/null || \
            missing+=("openai-whisper — pip3 install openai-whisper")

    else
        echo "ERROR: 未知 mode: '$mode'（应为 a 或 b）。先跑 /xugongzi-init" >&2
        exit 1
    fi

    echo "=== 依赖检测（mode: $mode · 硬件: $(cmd_detect_hardware)）==="

    if [[ ${#missing[@]} -eq 0 && ${#warnings[@]} -eq 0 ]]; then
        echo ""
        echo "✅ 所有依赖就绪，可以开始用了"
        return 0
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo ""
        echo "❌ 缺失依赖（必须装完才能用）："
        for item in "${missing[@]}"; do
            echo "   - $item"
        done
    fi

    if [[ ${#warnings[@]} -gt 0 ]]; then
        echo ""
        echo "⚠️  警告："
        for item in "${warnings[@]}"; do
            echo "   - $item"
        done
    fi

    echo ""
    echo "详细指引: INSTALL.md"
    return 1
}

case "${1:-}" in
    detect-hardware) cmd_detect_hardware ;;
    check)           shift; cmd_check "$@" ;;
    *)               echo "用法: $0 {detect-hardware|check}" >&2; exit 1 ;;
esac

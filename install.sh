#!/bin/bash
# 半自动装机脚本（可选用）
# 用法: bash install.sh

set -euo pipefail

echo "=============================================="
echo "  许公子工具包精简版 · 装机向导"
echo "=============================================="
echo ""

# 1. 检测硬件
OS=$(uname -s)
ARCH=$(uname -m)
if [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
    HW="apple-silicon"
    echo "✓ 硬件：Apple Silicon Mac（两条路线都能跑）"
elif [[ "$OS" == "Darwin" ]]; then
    HW="intel-mac"
    echo "✓ 硬件：Intel Mac（只能跑路线 B）"
elif [[ "$OS" == "Linux" ]]; then
    HW="linux"
    echo "✓ 硬件：Linux（只能跑路线 B）"
else
    echo "⚠️  硬件未识别：$OS/$ARCH"
    HW="other"
fi
echo ""

# 2. 问路线
if [[ "$HW" == "apple-silicon" ]]; then
    echo "你想装哪条路线？"
    echo "  A) 满血版（速度快、功能全，依赖复杂）"
    echo "  B) 通用版（装得快、够用、功能够）"
    read -p "选 [A/B]（默认 B）: " MODE
    MODE=${MODE:-B}
    MODE=$(echo "$MODE" | tr '[:upper:]' '[:lower:]')
else
    echo "（非 Apple Silicon，只能走路线 B）"
    MODE="b"
fi
echo ""

# 3. 装共用依赖
echo "==== 装共用依赖（jq / ffmpeg / yt-dlp）===="
if command -v brew >/dev/null; then
    brew install jq ffmpeg yt-dlp python3 || true
elif command -v apt >/dev/null; then
    sudo apt update && sudo apt install -y jq ffmpeg python3 python3-pip
    pip3 install yt-dlp
else
    echo "⚠️  找不到 brew 或 apt。自己装：jq, ffmpeg, yt-dlp, python3"
fi
echo ""

# 4. 装 Python 转写库
if [[ "$MODE" == "a" ]]; then
    echo "==== 装 mlx-whisper（路线 A）===="
    pip3 install mlx-whisper
    echo ""
    echo "==== 建 Python venv + f2 ===="
    mkdir -p ~/bin
    if command -v uv >/dev/null; then
        uv venv ~/bin/.venv --python 3.11
        uv pip install --python ~/bin/.venv/bin/python f2 opencc-python-reimplemented
    else
        python3 -m venv ~/bin/.venv
        ~/bin/.venv/bin/pip install f2 opencc-python-reimplemented
    fi
    echo ""
    echo "⚠️  接下来需要你手动完成："
    echo "   1. 装 DouK (TikTokDownloader) 并登录抖音"
    echo "      → https://github.com/JoeanAmier/TikTokDownloader"
    echo "   2. symlink douyin-toolkit 到 ~/bin/："
    echo "      ln -sf \"\$(pwd)/scripts/mode_a/douyin-toolkit\" ~/bin/douyin-toolkit"
    echo "   详见 INSTALL.md 路线 A 步骤 3-5"
else
    echo "==== 装 openai-whisper（路线 B）===="
    pip3 install openai-whisper
fi
echo ""

echo "=============================================="
echo "  依赖装完。回到 Claude Code 跑 /xugongzi-init"
echo "=============================================="

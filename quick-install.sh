#!/bin/bash
# 许公子工具包 · 一键安装脚本
# 用法（学员直接粘到终端跑）:
#   curl -fsSL https://raw.githubusercontent.com/xupengcheng/xugongzi-lite-plugin/main/quick-install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/xupengcheng/xugongzi-lite-plugin.git"
PLUGIN_DIR="$HOME/.claude/plugins/xugongzi-lite"
CLAUDE_PLUGINS="$HOME/.claude/plugins"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     许公子工具包 · 一键安装                  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "接下来会做 3 件事："
echo "  1. 把 plugin 克隆到 ~/.claude/plugins/xugongzi-lite"
echo "  2. 按你的机器装系统依赖（ffmpeg / yt-dlp / whisper 等）"
echo "  3. 告诉你怎么启动"
echo ""

# 检查 git
if ! command -v git >/dev/null 2>&1; then
    echo "❌ 没找到 git。先装 git："
    echo "   macOS:  xcode-select --install"
    echo "   Linux:  sudo apt install git"
    exit 1
fi

# Step 1: clone
echo "──── [1/3] 下载 plugin ────"
mkdir -p "$CLAUDE_PLUGINS"

if [[ -d "$PLUGIN_DIR/.git" ]]; then
    echo "📦 已存在，拉取最新版本..."
    cd "$PLUGIN_DIR"
    git pull --rebase --autostash || {
        echo "⚠️  拉取失败，可能是你改过本地文件。要重装请先：rm -rf $PLUGIN_DIR"
        exit 1
    }
elif [[ -e "$PLUGIN_DIR" ]]; then
    echo "❌ $PLUGIN_DIR 已存在但不是 git repo。请手动处理："
    echo "   rm -rf $PLUGIN_DIR"
    exit 1
else
    echo "📦 克隆到 $PLUGIN_DIR..."
    git clone --depth 1 "$REPO_URL" "$PLUGIN_DIR"
fi
echo "✓ plugin 已就位"
echo ""

# Step 2: 依赖（调 repo 里的 install.sh）
echo "──── [2/3] 装系统依赖 ────"
bash "$PLUGIN_DIR/install.sh"
echo ""

# Step 3: 完成提示
cat <<'EOF'
╔══════════════════════════════════════════════╗
║            ✅  安装完成                      ║
╚══════════════════════════════════════════════╝

下一步（3 步）：

1️⃣  完全退出 Claude Code（Cmd+Q，不是关窗口），重新打开

2️⃣  在 Claude Code 任意目录里，输入：
       /xugongzi-init
    按向导填 3 个保存目录的路径

3️⃣  丢一条抖音链接测试：
       /灵感提取 https://v.douyin.com/ABCDE/

────────────────────────────────────────────────

📂 配置位置：     ~/.xugongzi-toolkit/config.json
📜 任务日志：     ~/.xugongzi-toolkit/logs/
📖 使用手册：     ~/.claude/plugins/xugongzi-lite/README.md

遇到问题：群里 @ 许公子，带上截图 + 报错

EOF

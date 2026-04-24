# 安装指引

## 共同前置

不管选哪条路线，这些都要：

```bash
# macOS
brew install jq ffmpeg yt-dlp python3

# Linux (Debian/Ubuntu)
sudo apt install jq ffmpeg python3 python3-pip
pip3 install yt-dlp
```

---

## 路线 B · 通用版（推荐先装这个）

跨平台，功能简化，装机 5 分钟。

### 装 openai-whisper

```bash
pip3 install openai-whisper
```

首次转写会自动下载模型（base 约 150MB）。

### 装完验证

```bash
yt-dlp --version
ffmpeg -version
python3 -c "import whisper; print('whisper ok')"
```

三行都有输出 → 路线 B 就绪。回到 Claude Code 跑 `/xugongzi-init` 选 B。

---

## 路线 A · 满血版（Apple Silicon Mac 专属）

**前置要求**：M1 / M2 / M3 / M4 芯片的 Mac。Intel Mac / Linux / Windows 用不了。

### 1. 装 mlx-whisper

```bash
pip3 install mlx-whisper
```

首次转写会下载 large-v3-turbo 模型（约 1.5 GB）。

### 2. 建 Python venv

f2 库依赖多，单独一个虚拟环境干净：

```bash
# 如果没 uv，先 brew install uv
mkdir -p ~/bin/.venv
uv venv ~/bin/.venv --python 3.11
uv pip install --python ~/bin/.venv/bin/python f2 opencc-python-reimplemented
```

或不用 uv：

```bash
python3.11 -m venv ~/bin/.venv
~/bin/.venv/bin/pip install f2 opencc-python-reimplemented
```

### 3. 装 douyin-toolkit

这个 plugin 自带 douyin-toolkit 源码。把它 symlink 到 `~/bin/`：

```bash
# 找到 plugin 的安装位置（Claude Code 装完 plugin 会放在这里）
PLUGIN_ROOT="$HOME/.claude/plugins/xugongzi-lite"
# 如果找不到，可能路径不同，grep 下：
#   find ~/.claude -name "plugin.json" -path "*xugongzi*"

mkdir -p ~/bin
ln -sf "$PLUGIN_ROOT/scripts/mode_a/douyin-toolkit" ~/bin/douyin-toolkit
```

### 4. 装 DouK（TikTokDownloader）取 cookie

douyin-toolkit 直接复用 DouK 登录好的 cookie。

1. 去 https://github.com/JoeanAmier/TikTokDownloader 下 Mac 版
2. 装到 `~/Applications/TikTokDownloader/`
3. 启动 → 选 Chrome 读取 Cookie（序号 2）→ 首次会弹浏览器登抖音
4. 确认 `~/Applications/TikTokDownloader/_internal/Volume/settings.json` 存在

**为什么非得装这个**：抖音 API 要求登录 cookie 才能拉主页列表。DouK 是目前开源生态里最省心的 cookie 管理方案，plugin 只借用它的 cookie 文件，不用改 DouK 代码。

### 5. （可选）配账号表

如果你有自己的抖音账号，想让 `/抓整个号` 自动识别"这是我自己的号"：

```bash
mkdir -p ~/.xugongzi-toolkit
cat > ~/.xugongzi-toolkit/my_accounts.json <<'EOF'
{
  "我的号名": {
    "sec_uid": "MS4wLjABA....",
    "short_links": ["https://v.douyin.com/ABCDE/"]
  }
}
EOF
```

sec_uid 在主页 URL 里（`/user/MS4w...`），粘进去即可。不配的话所有号都当"别人号"处理，不影响功能。

### 6. 装完验证

```bash
~/bin/.venv/bin/python3 -c "import f2, opencc; print('f2 ok')"
mlx_whisper --help > /dev/null && echo "mlx_whisper ok"
test -f ~/Applications/TikTokDownloader/_internal/Volume/settings.json && echo "DouK cookie ok"
```

三行都 ok → 路线 A 就绪。

---

## 自动检测

装完任何路线后，回 Claude Code 跑：

```
/xugongzi-init
```

向导末尾会自己调 `check_deps.sh check`，把缺的依赖列出来。

也可以随时手动跑：

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/lib/check_deps.sh check
```

---

## 升级 / 切路线

### 从 B 升到 A

按上面路线 A 步骤装，然后：

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh set mode a
```

### 卸载 plugin

```
/plugin uninstall xugongzi-lite
```

配置文件 `~/.xugongzi-toolkit/` 不会被删，想彻底清理：

```bash
rm -rf ~/.xugongzi-toolkit
```

你的灵感池/拆解池/抓账号目录是你自己的文件，插件绝不删。

---
name: 灵感提取
description: 给一个视频链接（抖音/B站/小红书/YouTube），自动下载 → 转写 → 生成带时间码的 md 存到用户配置的灵感池目录。只抽文案不做分析。触发词：灵感提取、提取文案、抽这条文案、把这条视频文案抓下来
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# 灵感提取

当用户说「灵感提取 <URL>」、「帮我提取这条 <URL>」、「抽一下这条的文案 <URL>」或类似意图时，执行以下流程。

## Step 0: 检查工具包是否已装

```bash
test -f ~/.xugongzi-toolkit/config.json && test -d ~/.claude/plugins/xugongzi-lite && echo "INSTALLED" || echo "NOT_INSTALLED"
```

- 输出 `INSTALLED` → 继续 Step 1
- 输出 `NOT_INSTALLED` → 告诉用户「许公子工具包还没装好，让许公子发给你的安装指令，粘给我我就帮你装」，停下

## Step 1: 从用户输入里提取 URL

用户可能给整段抖音分享文字（含"XX 为你推荐 https://v.douyin.com/XXX..."）。用正则抽出第一个 `https?://` 开头的 URL。

如果没给 URL，问用户：「给我一条视频链接。」

## Step 2: 读配置

```bash
MODE=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh get mode)
INSP_DIR=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh get inspiration_dir)
```

## Step 3: 启动后台下载+转写任务

```bash
TASK_ID=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh create "灵感提取" "<URL>")
nohup bash ~/.claude/plugins/xugongzi-lite/scripts/mode_${MODE}/inspiration.sh "$TASK_ID" "<URL>" > /dev/null 2>&1 &
```

## Step 4: 告诉用户

```
✅ 任务已启动: <TASK_ID>
  视频: <URL>
  预估时间: 30 秒～3 分钟（看视频长度 + 是否有平台字幕）
  进度查看: 跟我说「任务状态」
  完成后 md 会写到: <INSP_DIR>/YYYY-MM-DD-<标题>.md
```

**立刻返回，不要阻塞等转写结果**。用户想查进度会触发"任务状态" skill。

## 产出的 md 结构

脚本自动生成，结构固定：

```markdown
---
标题: <视频标题>
平台: <抖音/B站/小红书/YouTube>
链接: <URL>
提取时间: YYYY-MM-DD HH:MM
方式: subtitle / whisper
状态: 已提取
任务ID: <task_id>
---

# <视频标题>

## 📄 原始文案

[00:02] xxx
[00:05] xxx
...
```

只抽文案，不做钩子/结构分析。要分析走「对标拆解」skill。

## 注意

- URL 清洗：如果是抖音分享文案，只留 `https://v.douyin.com/XXX/` 这段 URL
- 支持的平台：抖音、B 站、小红书、YouTube（其他平台 yt-dlp 兜底）
- 路线 A 的抖音走 douyin-toolkit（需 DouK cookie）；路线 B 全部走 yt-dlp

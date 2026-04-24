---
name: 对标拆解
description: 给一条对标视频链接，自动下载转写 + 跑钩子/结构/金句/可借鉴点四段分析，md 存到用户配置的拆解池目录。比「灵感提取」多一步分析。触发词：对标拆解、拆解这条、分析这条文案、拆这条
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# 对标拆解

当用户说「对标拆解 <URL>」、「帮我拆一下这条 <URL>」、「分析这条文案 <URL>」等时，执行以下流程。

比「灵感提取」skill 多一步：转写完后你要亲自读文案写分析。

## Step 0: 检查工具包已装

```bash
test -f ~/.xugongzi-toolkit/config.json && test -d ~/.claude/plugins/xugongzi-lite && echo "INSTALLED" || echo "NOT_INSTALLED"
```

未装 → 告诉用户「工具包还没装，找许公子要安装指令」。

## Step 1: 提取 URL

同「灵感提取」：从用户输入抽第一个 URL。

## Step 2: 读配置

```bash
MODE=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh get mode)
REVIEW_DIR=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh get review_dir)
```

## Step 3: 下载+转写（后台启动 + 等完成）

```bash
TASK_ID=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh create "对标拆解-抽文案" "<URL>")
nohup bash ~/.claude/plugins/xugongzi-lite/scripts/mode_${MODE}/inspiration.sh "$TASK_ID" "<URL>" "--target-dir=$REVIEW_DIR" > /dev/null 2>&1 &
```

告诉用户：「正在下载 + 转写，大约 1-3 分钟，完了就帮你拆解。」

等任务完成：

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh wait "$TASK_ID" --timeout 600
```

## Step 4: 读文案，跑 4 维分析

转写完的 md 在 `$REVIEW_DIR/YYYY-MM-DD-<标题>.md`。Read 这个文件，读 `## 📄 原始文案` 下的内容。

然后针对这段文案，**写四段分析**：

### 钩子（开场 3 秒）
- 前 15-25 字具体说了什么（原文引用）
- 用了什么勾人技巧：痛点 / 好奇 / 承诺 / 反常识 / 数字 / 对比
- 为什么能让目标观众停下来

### 结构（整体框架）
- 叙事逻辑：问题→解答 / 故事→金句 / 列举→总结 / 对比→反转 / 设问→自答
- 节奏安排（信息密度、转折时机）
- 结尾收场方式

### 金句（原文引用）
- 选 1-3 句最值得借鉴的话
- 每句说明好在哪（语言特点 / 心理触发机制）
- **必须原文引用，不要改写**

### 可借鉴的点
- 具体 1-3 个能直接复用的点（钩子模板 / 选题方向 / 过渡话术）
- **要具体**：「套用他的反转钩子做 XX 选题」，不是「学他的风格」
- 不要泛泛评论（"这个号做得挺不错"），不要学术化分析

## Step 5: 追加到 md

把 4 段分析 append 到同一个 md 文件末尾：

```markdown
---

## 🎯 拆解分析

### 钩子（开场 3 秒）
...

### 结构（整体框架）
...

### 金句（原文引用）
...

### 可借鉴的点
...
```

## Step 6: 告诉用户

```
✅ 拆解完成：<视频标题>
  文件: <REVIEW_DIR>/YYYY-MM-DD-<标题>.md
  已写入 4 段分析（钩子/结构/金句/可借鉴点）
```

## 注意

- 金句**原文引用**，不改写
- 可借鉴点要具体，不是泛泛「学习他」
- 不给账号打分，不写学术化分析
- 样本（单条）不够做"账号级"规律判断，只做这一条的点评

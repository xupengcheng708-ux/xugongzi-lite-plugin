---
name: 抓整个号
description: 给抖音主页分享链接，列出全部作品 → 用户筛选 → 批量下载转写 → 归档到用户配置的抓账号目录。触发词：抓整个号、抓这个号、批量抓、把这个号的视频都抓下来、主页抓取
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# 抓整个号

当用户说「抓整个号 <主页URL>」、「批量抓一下这个号 <URL>」、「把这人的视频都抓下来 <URL>」等时，执行以下流程。

**核心原则**：先列后选。没让用户看过清单之前绝不下载任何视频。

## Step 0: 检查工具包已装

```bash
test -f ~/.xugongzi-toolkit/config.json && test -d ~/.claude/plugins/xugongzi-lite && echo "INSTALLED" || echo "NOT_INSTALLED"
```

未装 → 停下提示用户。

## Step 1: 提取主页 URL

接受三种格式：
- `v.douyin.com/xxx` 短链
- `www.douyin.com/user/MS4w...` 长链
- 纯 sec_uid 字符串 `MS4wLj...`

## Step 2: 读配置

```bash
MODE=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh get mode)
ACCOUNT_DIR=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/config.sh get account_dir)
```

## Step 3: 列全部作品

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/mode_${MODE}/account.sh list "<主页URL>" "/tmp/xgz_list_$$.json"
```

读脚本输出，展示给用户：账号昵称、作品总数、前 30 条清单。

⚠️ 路线 B 拿不到点赞/评论数，只有发布日期和标题。提醒用户。

## Step 4: 问用户用什么策略筛

用 AskUserQuestion 问：「要抓哪些？」给几个默认选项：
- 最新 10 条
- 最新 20 条
- 全部（提醒：N × 2 分钟转写成本）
- 近半年 top 20（路线 A 专属，按点赞筛）
- 某个日期段
- 手动指定 aweme_id

## Step 5: 按策略筛 + 展示清单 + 等用户确认

在内存里按用户选的策略过滤 JSON，算出 aweme_id 列表。

展示给用户：

```
按你说的「{策略}」命中 N 条：
  1. 2025-XX-XX | XXX 赞（路线 B 无此字段）| 标题前 40 字
  2. ...
要按这份清单下载吗？模式：
  - 保留视频（占磁盘多）
  - 仅文案（默认，省 80% 磁盘）
```

⚠️ **必须等用户明确「开始」、「下载」、「OK」再往下走**。

## Step 6: 启动批量下载后台任务

```bash
TASK_ID=$(bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh create "抓整个号" "<主页URL> | N 条")
nohup bash ~/.claude/plugins/xugongzi-lite/scripts/mode_${MODE}/account.sh download \
    "/tmp/xgz_list_$$.json" "$TASK_ID" "$ACCOUNT_DIR" \
    --ids "<逗号分隔的 aweme_id>" \
    [--audio-only | --keep-video] \
    > /dev/null 2>&1 &
```

## Step 7: 告诉用户

```
✅ 已启动批量下载 N 条视频
  任务 ID: <TASK_ID>
  预估时间: N × 2 分钟
  进度查看: 跟我说「任务状态」
  归档位置: <ACCOUNT_DIR>/<账号名>/
  完成后会生成 _索引.md（按发布时间倒序的总表）
```

立刻返回，不阻塞等完成。

## 注意

- 单次别超过 50 条（风控）
- 默认 `--audio-only`（抽完音频删视频，省磁盘）
- 路线 B 策略受限（拿不到点赞数，不能按点赞筛）
- 抓完可以引导用户：「要挑几条做对标拆解吗？爆款 top3 是 ...」

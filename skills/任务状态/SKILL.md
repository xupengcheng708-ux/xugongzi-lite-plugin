---
name: 任务状态
description: 查看后台下载/转写任务的进度。触发词：任务状态、查任务、看进度、任务跑到哪了、后台跑到哪了
allowed-tools: Read, Bash
---

# 任务状态

当用户说「任务状态」、「查下任务」、「看进度」、「任务跑到哪了」时，执行以下流程。

## Step 1: 列所有任务

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh list
```

脚本输出类似：

```
状态     任务ID                      类型       进度    参数
🟢 跑中  xgz-20260424-143210-abc     灵感提取   60%    https://v.douyin...
🟢 跑中  xgz-20260424-142845-def     抓整个号   8/10   <主页URL>
✅ 完成  xgz-20260424-142003-ghi     对标拆解   100%   https://v.douyin...
❌ 失败  xgz-20260424-141522-jkl     灵感提取   -      https://xxx...
```

原样展示给用户（用 markdown 表格或代码块渲染）。

## Step 2: 有失败任务时主动问

如果列表里有 ❌ 失败任务，追加一句：「有失败的任务，想看报错原因吗？」

用户说"要" → Read `~/.xugongzi-toolkit/logs/<task_id>.log` 的末尾 30 行，展示给用户，判断失败原因（网络错误/cookie 过期/依赖缺失/视频被删/...）。

## Step 3: 清理旧任务（可选）

如果用户说「清理旧任务」、「把完成的清掉」：

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh clean
```

会清掉 24 小时前的**已完成/已失败**任务，保留正在跑的。

## Step 4: 查单个任务详情（可选）

如果用户提到具体 task_id（比如「xgz-20260424-xxx 怎么样了」），直接:

```bash
bash ~/.claude/plugins/xugongzi-lite/scripts/lib/task_log.sh log <task_id>
```

展示完整日志。

## 注意

- 如果列表空，告诉用户「当前没有任务在跑」
- 任务超过 10 分钟还在 "跑中" 可能卡住了，提示用户看日志
- 不要主动清理任务，除非用户明确要求

# 许公子工具包 · 精简版

Claude Code Plugin。4 条命令搞定抖音内容创作者核心工作流：

| 命令 | 用途 |
|---|---|
| `/灵感提取 <URL>` | 单条视频 → 下载 → 转写 → 存灵感池 |
| `/对标拆解 <URL>` | 单条对标视频 → 转写 → 跑钩子/结构/金句分析 → 存拆解池 |
| `/抓整个号 <主页URL>` | 抖音主页 → 列作品 → 你筛选 → 批量下载转写 → 归档 |
| `/任务状态` | 查后台下载/转写任务进度 |

保存位置**完全你自己定**，插件不碰你的目录结构。

---

## 🚀 零终端安装（推荐）

**前提**：已经装好 Claude Code。

打开 Claude Code（任意目录），在输入框依次粘这**两条命令**：

**第 1 条**：添加 marketplace

```
/plugin marketplace add github:xupengcheng708-ux/xugongzi-lite-plugin
```

**第 2 条**：装 plugin

```
/plugin install xugongzi-lite@xugongzi-toolkit
```

装完 Claude Code 会自动识别 4 条命令 + 首次提示你跑 `/xugongzi-init` 配置保存目录。

**全程在 Claude Code 里完成，不用打开终端**。

---

## 装完 3 步开用

### 1. 跑初始化向导

在 Claude Code 里输入：

```
/xugongzi-init
```

向导会问你：

- 选路线 A 还是 B（不知道就选 B，跨平台通用）
- 三个保存目录：
  - **灵感池**（单条视频的文案存这）
  - **拆解池**（对标分析结果存这）
  - **抓账号**（批量抓取的号归档到这）

三个路径**你自己定**。可以是 Obsidian vault 里的子目录，也可以是桌面上任意文件夹。

### 2. 装系统依赖

向导结束会列出你还缺的工具（比如 `yt-dlp`、`ffmpeg`、`whisper` 等）。

直接告诉 Claude Code：「帮我装这些依赖」，Claude 会带你一步步装完（需要你授权执行 `brew install`）。

### 3. 试一条

复制一条抖音分享链接（含 `https://v.douyin.com/...`），粘：

```
/灵感提取 https://v.douyin.com/ABCDE/
```

几十秒后会在你配置的「灵感池」目录里看到一个 `.md` 文件，带完整文案 + 时间码。

---

## 产出长什么样

```markdown
---
标题: 他们为什么都在偷偷学英语
平台: 抖音
链接: https://v.douyin.com/ABCDE/
提取时间: 2026-04-24 15:32
方式: whisper
状态: 已提取
---

# 他们为什么都在偷偷学英语

## 📄 原始文案

[00:02] 最近我发现一个很奇怪的现象
[00:05] 身边越来越多人开始偷偷学英语
...
```

`/对标拆解` 会额外追加钩子/结构/金句/可借鉴点四段分析。

---

## 两条路线对比

|  | **路线 A · 满血版** | **路线 B · 通用版** |
|---|---|---|
| 硬件 | Apple Silicon Mac（M1/M2/M3/M4） | Mac / Linux / Windows |
| 抖音主页筛选 | ✅ 按点赞/评论/日期/全部 | ⚠️ 只能按「最新 N 条/日期段」 |
| 转写速度 | 快 3-5 倍（mlx_whisper） | 普通（openai-whisper） |
| 依赖数 | 多 3 个（f2 / DouK cookie / mlx） | 简单（3 个 brew 包） |

**新手先走 B**。嫌慢或要按点赞筛选再升级到 A。切换：重跑 `/xugongzi-init` 选新路线。

---

## 常见问题

**Q: `/plugin marketplace add` 报错？**
A: 检查 GitHub 用户名/repo 名拼写；私有 repo 需要配 GitHub token（默认公开）。

**Q: 粘完命令没反应？**
A: 在 Claude Code 输入框按回车提交，不是直接粘。

**Q: 配置存哪？想改？**
A: `~/.xugongzi-toolkit/config.json`。重跑 `/xugongzi-init` 覆盖，或直接编辑。

**Q: 升级 plugin？**
A: 在 Claude Code 跑 `/plugin update xugongzi-lite@xugongzi-toolkit`，自动拉最新。

**Q: 卸载？**
A: `/plugin uninstall xugongzi-lite@xugongzi-toolkit`。你的灵感池/拆解池/抓账号目录是你自己的，插件绝不删。

**Q: 抓抖音主页失败？**
A:
- 路线 A：需要先装 DouK（TikTokDownloader）登一次抖音拿 cookie
- 路线 B：某些私密/合拍账号 yt-dlp 拉不到

---

## 备用安装方式（marketplace 出问题时）

万一 Claude Code 的 marketplace 机制有问题，还有终端 fallback：

```bash
curl -fsSL https://raw.githubusercontent.com/xupengcheng708-ux/xugongzi-lite-plugin/main/quick-install.sh | bash
```

优先用 plugin marketplace 方式（官方机制、支持 `/plugin update`）。

---

## 许可

MIT · [许公子](https://github.com/xupengcheng708-ux)

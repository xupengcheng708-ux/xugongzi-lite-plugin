# 文案提取面板（Raycast Extension）

把桌面上那 5 个 `.app`（视频复盘批量提取器 / 提取视频文案器 / 本地视频文案提取器）合并成 Raycast 命令集，直接写入「许公子的第二大脑」对应目录。

> FCPX 字幕、新建剪辑文件两个 .app **不在合并范围**，保留原样。

---

## 依赖（已有，无需重装）

- `~/.local/bin/mlx_whisper` — Whisper MLX 版
- `~/bin/inspiration-extract.sh` — URL 下载+转录
- `~/bin/batch-review-transcript.sh` — 批量本地转录
- `~/bin/format_transcript.py` — SRT → Markdown
- `~/bin/.venv/bin/python3` — Python 虚拟环境
- `yt-dlp`、`ffmpeg`、Downie 4（抖音/视频号走 Downie）

---

## 首次安装

```bash
# 1. 装 Raycast（如果没装）
brew install --cask raycast

# 2. 装项目依赖
cd ~/Code/raycast-extensions/wenan-extractor
npm install

# 3. 加载到 Raycast（开发模式，改代码自动重载）
npm run dev
```

`npm run dev` 跑起来后，打开 Raycast（默认快捷键 `⌥ + Space`），搜：

- **灵感提取** — 粘贴单条视频链接 → 入库 `00_收件箱/灵感/`
- **本地复盘** — 选本地视频（可多选）→ 入库 `00_收件箱/逐字稿/{账号}/`
- **对标拆解** — 开发中
- **抓整个号** — 开发中

---

## 已实现 vs 待开发

| 命令 | 状态 | 对应桌面 app |
|---|---|---|
| 灵感提取 | ✅ | 提取视频文案器 |
| 本地复盘 | ✅ | 视频复盘批量提取器 |
| 本地素材转写 | 合并进「本地复盘」| 本地视频文案提取器 |
| 对标拆解 | 🚧 下版 | — |
| 抓整个号 | 🚧 下版 | — |

---

## 设计原则

1. **薄包装**：不重写转录/下载逻辑，全部复用 `~/bin/` 现有脚本
2. **脏活给 Raycast，脑活给 Claude Code**：Raycast 只管入库，AI 分析（灵感处理、文案拆解）继续走 Skill
3. **输出符合现有 vault 规范**：落盘路径、frontmatter 结构与现有工具链一致

---

## 目录

```
wenan-extractor/
├── package.json
├── tsconfig.json
├── src/
│   ├── config.ts                 # vault 路径 / 账号 / 脚本位置
│   ├── extract-inspiration.tsx   # 灵感提取
│   ├── batch-review.tsx          # 本地复盘
│   ├── extract-benchmark.tsx     # 占位
│   └── scrape-account.tsx        # 占位
└── assets/
    └── extension-icon.png        # 512x512 占位图（可替换）
```

---

## 图标

`assets/extension-icon.png` 是自动生成的渐变紫色占位图。想换真图标：丢一张 **512x512 PNG** 到同路径覆盖即可。

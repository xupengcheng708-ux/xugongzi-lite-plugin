#!/usr/bin/env python3
"""批量转写归档（路线 A：mlx_whisper）

读 douyin-toolkit 的 _manifest.json，逐条跑 mlx_whisper 转写，写 md 到目标目录。
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def sanitize(name: str, maxlen: int = 60) -> str:
    name = re.sub(r'[/\\:*?"<>|#^\[\]]', "_", name)
    return name[:maxlen]


def whisper_srt(audio_path: Path, out_dir: Path) -> Path | None:
    """mlx_whisper 转写，返回 srt 文件路径"""
    cmd = [
        "mlx_whisper", str(audio_path),
        "--model", "mlx-community/whisper-large-v3-turbo",
        "--output-format", "srt",
        "--output-dir", str(out_dir),
        "--language", "zh",
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    stem = audio_path.stem
    srt = out_dir / f"{stem}.srt"
    return srt if srt.exists() else None


def srt_to_text(srt_path: Path) -> str:
    content = srt_path.read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r"\n\n+", content.strip())
    lines = []
    for block in blocks:
        parts = block.strip().split("\n")
        if len(parts) < 3:
            continue
        m = re.match(r"(\d{2}:\d{2}:\d{2})", parts[1])
        if not m:
            continue
        ts = m.group(1)
        if ts.startswith("00:"):
            ts = ts[3:]
        text = " ".join(parts[2:]).strip()
        if text:
            lines.append(f"[{ts}] {text}")
    return "\n".join(lines)


def update_task(task_id: str, progress: str):
    task_log = os.environ.get("XGZ_TASK_LOG", "")
    if task_id and task_log:
        subprocess.run(
            ["bash", task_log, "update", task_id, "running", progress],
            capture_output=True,
        )


def main():
    if len(sys.argv) < 3:
        print("Usage: archive_batch.py <manifest.json> <out_dir> [task_id]", file=sys.stderr)
        sys.exit(1)

    manifest_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    task_id = sys.argv[3] if len(sys.argv) > 3 else ""

    out_dir.mkdir(parents=True, exist_ok=True)
    tmp_srt = Path.home() / ".cache" / "xugongzi-toolkit" / "srt"
    tmp_srt.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text())
    items = manifest.get("items", []) or manifest.get("videos", [])
    total = len(items)
    if total == 0:
        print("WARN: manifest 里没有 items")
        return

    for i, item in enumerate(items, 1):
        title = item.get("desc") or item.get("title") or f"video_{i}"
        url = item.get("share_url") or item.get("url") or ""
        publish = item.get("create_time", "")
        digg = item.get("digg_count", 0)
        comment = item.get("comment_count", 0)
        audio = item.get("audio_path") or item.get("video_path")
        if not audio or not Path(audio).exists():
            print(f"SKIP {i}/{total}: 文件不存在 {audio}")
            continue

        print(f"[{i}/{total}] 转写: {title[:30]}")
        update_task(task_id, f"{i}/{total}")

        body = "（转写失败）"
        try:
            srt = whisper_srt(Path(audio), tmp_srt)
            if srt:
                body = srt_to_text(srt)
            if not body.strip() or len(body) < 5:
                body = "（无人声，纯画面/字幕视频）"
        except subprocess.CalledProcessError as e:
            print(f"  FAIL: {e.stderr[:200] if e.stderr else e}")
            body = f"（mlx_whisper 异常）"
        except Exception as e:
            print(f"  FAIL: {e}")

        safe_title = sanitize(title)
        date = publish[:10] if publish else datetime.now().strftime("%Y-%m-%d")
        md_path = out_dir / f"{date}-{safe_title}.md"
        if md_path.exists():
            md_path = out_dir / f"{date}-{safe_title}-{i}.md"

        md_path.write_text(
            f"""---
标题: {title}
平台: 抖音
链接: {url}
发布时间: {publish}
点赞: {digg}
评论: {comment}
抓取时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}
方式: whisper
状态: 已抓取
任务ID: {task_id}
---

# {title}

## 📄 原始文案

{body}
""",
            encoding="utf-8",
        )
        print(f"  ✓ {md_path.name}")

    print(f"完成: {total} 条")


if __name__ == "__main__":
    main()

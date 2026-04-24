#!/usr/bin/env python3
"""SRT 转带时间码纯文本"""
import re
import sys
from pathlib import Path


def srt_to_text(srt_path: str) -> str:
    content = Path(srt_path).read_text(encoding="utf-8", errors="ignore")
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


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: format_srt.py <srt_file>", file=sys.stderr)
        sys.exit(1)
    print(srt_to_text(sys.argv[1]))

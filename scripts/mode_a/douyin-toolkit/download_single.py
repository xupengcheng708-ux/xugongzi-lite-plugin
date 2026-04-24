#!/usr/bin/env python3
"""单条抖音视频 URL → 下载 mp4（不依赖 Downie）

用法：
  download_single.py <URL> --out DIR

输出：
  stdout:
    VIDEO:<mp4 绝对路径>
    TITLE:<视频描述>
  stderr:
    INFO: ...  进度信息
"""
import sys, re, argparse, asyncio, subprocess
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).parent))
from _common import f2_kwargs, f2_workdir
from download_by_ids import download_one, sanitize


async def resolve_aweme_id(url: str) -> str:
    """短链 / 长链 → aweme_id"""
    s = url.strip()
    m = re.search(r'/video/(\d+)', s)
    if m:
        return m.group(1)
    m = re.search(r'modal_id=(\d+)', s)
    if m:
        return m.group(1)
    if 'v.douyin.com' in s or 'iesdouyin.com' in s:
        # 短链跳转：用 curl（比 httpx 稳，抖音 CDN 对 httpx 经常 ConnectTimeout）
        try:
            result = subprocess.run(
                ['curl', '-sI', '-L', '-o', '/dev/null',
                 '-w', '%{url_effective}',
                 '-m', '30',
                 '-A', 'Mozilla/5.0',
                 s],
                capture_output=True, text=True, timeout=40
            )
            final = (result.stdout or '').strip()
            m = re.search(r'/video/(\d+)', final) or re.search(r'modal_id=(\d+)', final)
            if m:
                return m.group(1)
            raise ValueError(f'短链跳转后找不到 aweme_id: {final!r}')
        except subprocess.TimeoutExpired:
            raise RuntimeError('短链解析超时（curl 40 秒都没响应）')
    raise ValueError(f'无法解析 aweme_id: {url}')


async def main_async(args):
    print(f'INFO: 解析链接...', file=sys.stderr, flush=True)
    aweme_id = await resolve_aweme_id(args.url)
    print(f'INFO: aweme_id = {aweme_id}', file=sys.stderr, flush=True)

    print(f'INFO: 用 f2 拉签名 URL...', file=sys.stderr, flush=True)
    with f2_workdir():
        from f2.apps.douyin.handler import DouyinHandler
        h = DouyinHandler(f2_kwargs('post'))
        v = await h.fetch_one_video(aweme_id=aweme_id)

    # f2 返回的是 video filter 对象，字段视版本
    pa = getattr(v, 'video_play_addr', None)
    video_url = pa[0] if isinstance(pa, list) and pa else pa
    desc = getattr(v, 'desc', '') or ''
    nickname = getattr(v, 'nickname', '') or ''

    if not video_url:
        print('ERROR: 该视频无 video_play_addr（可能已删除或仅直播回放）', file=sys.stderr)
        sys.exit(2)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = f'{aweme_id}-{sanitize(desc, 30)}' if desc else aweme_id
    mp4 = out / f'{stem}.mp4'

    print(f'INFO: 下载 mp4...', file=sys.stderr, flush=True)
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        await download_one(client, video_url, mp4)

    size_kb = mp4.stat().st_size // 1024
    print(f'INFO: ✓ mp4 已下载 ({size_kb} KB)', file=sys.stderr, flush=True)
    print(f'VIDEO:{mp4}')
    print(f'TITLE:{desc}')
    if nickname:
        print(f'NICKNAME:{nickname}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('url', help='抖音视频 URL（短链或长链）')
    ap.add_argument('--out', required=True, help='输出目录')
    asyncio.run(main_async(ap.parse_args()))


if __name__ == '__main__':
    main()

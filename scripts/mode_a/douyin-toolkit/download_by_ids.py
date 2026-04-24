#!/usr/bin/env python3
"""按 aweme_id 列表下载视频/音频（不依赖 DouK）

用法：
  download_by_ids.py <list.json> --ids 7625984...,7626362... --out DIR [--audio-only]

输入：list_videos.py 产出的 JSON
输出：
  DIR/
    {date} {time}-{aweme_id}-{desc前缀}.mp4   （video 模式）
    {date} {time}-{aweme_id}-{desc前缀}.wav   （audio-only 模式）
    _manifest.json   选中条目的元数据（archive 步骤吃）
"""
import sys, json, argparse, asyncio, re, subprocess
from pathlib import Path
import httpx
sys.path.insert(0, str(Path(__file__).parent))
from _common import f2_kwargs, f2_workdir

import shutil
FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'


def sanitize(s, maxlen=40):
    return re.sub(r'[\/\\\:\*\?\"\<\>\|\n\r]', '_', s or '')[:maxlen].rstrip(' .')


async def download_one(client, video_url, dest, max_retries=4):
    """抖音 CDN 经常 chunked stream 中途断，按 Range 续传重试"""
    import asyncio
    headers = {'Referer': 'https://www.douyin.com/'}
    expected = None
    for attempt in range(max_retries):
        already = dest.stat().st_size if dest.exists() else 0
        h = dict(headers)
        if already > 0:
            h['Range'] = f'bytes={already}-'
        try:
            async with client.stream('GET', video_url, headers=h) as r:
                if r.status_code in (200, 206):
                    if expected is None:
                        cr = r.headers.get('content-range', '')
                        if '/' in cr:
                            expected = int(cr.rsplit('/', 1)[-1])
                        elif r.headers.get('content-length'):
                            expected = already + int(r.headers['content-length'])
                    mode = 'ab' if r.status_code == 206 and already > 0 else 'wb'
                    with open(dest, mode) as f:
                        async for chunk in r.aiter_bytes(64*1024):
                            f.write(chunk)
                else:
                    r.raise_for_status()
            got = dest.stat().st_size
            if expected is None or got >= expected:
                return  # 成功
            # 部分写入但未到 expected → 进入 retry
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(1.5)
            continue
        await asyncio.sleep(1)
    raise RuntimeError(f'下载未完整：{dest.stat().st_size}/{expected}')


def to_audio(mp4_path, wav_path):
    subprocess.run([FFMPEG, '-i', str(mp4_path), '-vn', '-acodec', 'pcm_s16le',
                    '-ar', '16000', '-ac', '1', str(wav_path), '-y'],
                   capture_output=True, check=True)


async def refresh_video_url(aweme_id):
    """用 f2 拿新签名 URL（抖音 CDN 签名约 10 分钟失效）"""
    from f2.apps.douyin.handler import DouyinHandler
    with f2_workdir():
        h = DouyinHandler(f2_kwargs('post'))
        v = await h.fetch_one_video(aweme_id)
        pa = v.video_play_addr
        return pa[0] if isinstance(pa, list) and pa else pa


async def main_async(args):
    data = json.loads(Path(args.list).read_text())
    by_id = {v['aweme_id']: v for v in data['videos']}
    ids = [i.strip() for i in args.ids.split(',') if i.strip()]
    selected = [by_id[i] for i in ids if i in by_id]
    missing = [i for i in ids if i not in by_id]
    if missing:
        print(f'⚠ 列表里找不到 {len(missing)} 个 ID: {missing[:3]}...', flush=True)
    if not selected:
        print('✗ 没有可下载的条目'); return

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'account': data.get('matched_account') or data['nickname'],
                'sec_uid': data['sec_uid'], 'mode': 'audio' if args.audio_only else 'video',
                'items': []}

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        for i, v in enumerate(selected, 1):
            ts = v['create_time'].replace(':', '.')
            stem = f'{ts}-{v["aweme_id"]}-{sanitize(v["desc"], 30)}'
            mp4 = out / f'{stem}.mp4'
            wav = out / f'{stem}.wav'
            print(f'[{i}/{len(selected)}] {v["create_time"]} | {v["digg_count"]}赞 | {v["desc"][:30]}', flush=True)
            # 快路径：audio-only 且 wav 已存在 → 整条跳过（避免重复下载已成功条目）
            if args.audio_only and wav.exists():
                print(f'  · wav 已存在 ({wav.stat().st_size//1024} KB)，跳过')
                manifest['items'].append({**v, 'mp4_path': None, 'wav_path': str(wav)})
                continue
            if not mp4.exists():
                # 总是刷新签名，避免 list 到 download 拖太久导致 URL 过期
                try:
                    fresh_url = await refresh_video_url(v['aweme_id'])
                except Exception as e:
                    print(f'  ⚠ 刷新签名失败，用旧 URL: {type(e).__name__}'); fresh_url = v.get('video_url')
                if not fresh_url:
                    print('  ✗ 无 video_url，跳过'); continue
                try:
                    await download_one(client, fresh_url, mp4)
                    print(f'  ✓ mp4 ({mp4.stat().st_size//1024} KB)', flush=True)
                except Exception as e:
                    print(f'  ✗ 下载失败: {type(e).__name__}: {e!r}'); continue
            else:
                print('  · mp4 已存在')

            entry = {**v, 'mp4_path': str(mp4)}
            if args.audio_only:
                wav = out / f'{stem}.wav'
                if not wav.exists():
                    try:
                        to_audio(mp4, wav)
                        print(f'  ✓ wav ({wav.stat().st_size//1024} KB)', flush=True)
                    except Exception as e:
                        print(f'  ✗ ffmpeg 失败: {e}'); continue
                mp4.unlink()  # audio-only：扔掉视频
                entry['mp4_path'] = None
                entry['wav_path'] = str(wav)
            manifest['items'].append(entry)

    (out / '_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f'\n✓ 完成 {len(manifest["items"])}/{len(selected)} → {out}')
    print(f'  manifest: {out}/_manifest.json')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('list', help='list_videos.py 产出的 JSON 路径')
    ap.add_argument('--ids', required=True, help='逗号分隔的 aweme_id')
    ap.add_argument('--out', required=True, help='输出目录')
    ap.add_argument('--audio-only', action='store_true', help='只要音频（mp4 抽 wav 后删掉）')
    asyncio.run(main_async(ap.parse_args()))


if __name__ == '__main__':
    main()

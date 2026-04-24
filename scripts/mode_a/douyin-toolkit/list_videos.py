#!/usr/bin/env python3
"""列出账号全部作品元数据 → JSON

用法：
  list_videos.py <主页链接|短链|sec_uid> [--out PATH] [--limit N]

输出 JSON 结构：
  {"sec_uid":"...", "nickname":"...", "fetched_at":"...", "count":N, "videos":[{...}, ...]}
"""
import sys, json, asyncio, argparse, datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _common import resolve_sec_uid, f2_kwargs, normalize_video, match_account_by_sec_uid, f2_workdir


async def fetch_all(sec_uid, limit=None):
    from f2.apps.douyin.handler import DouyinHandler
    h = DouyinHandler(f2_kwargs())
    # 异步循环全程在 f2 缓存目录里跑，f2 的 logs/ 落到那里
    # （此函数本身不写 stdout 之外的相对路径文件）
    out = []
    cursor = 0
    page = 0
    while True:
        page += 1
        got_this_page = 0
        async for vl in h.fetch_user_post_videos(
            sec_user_id=sec_uid, min_cursor=0, max_cursor=cursor, page_counts=20):
            items = vl._to_list()
            raw = vl._to_raw().get('aweme_list', [])
            raw_by_id = {str(r.get('aweme_id')): r for r in raw}
            for it in items:
                rec = normalize_video(it, raw_by_id.get(str(it.get('aweme_id'))))
                out.append(rec)
                got_this_page += 1
            new_cursor = items[-1].get('max_cursor', 0) if items else 0
            has_more = items[-1].get('has_more', False) if items else False
            cursor = new_cursor
            if not has_more or (limit and len(out) >= limit):
                return out[:limit] if limit else out
            break
        if got_this_page == 0:
            return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target', help='主页链接 / 短链 / sec_uid')
    ap.add_argument('--out', default=None, help='JSON 输出路径（默认 stdout）')
    ap.add_argument('--limit', type=int, default=None, help='最多拉多少条（默认全量）')
    args = ap.parse_args()

    # --out 在 chdir 前固化成绝对路径
    out_path = Path(args.out).resolve() if args.out else None
    with f2_workdir():
        sec_uid = asyncio.run(resolve_sec_uid(args.target))
        videos = asyncio.run(fetch_all(sec_uid, limit=args.limit))
    nickname = videos[0]['nickname'] if videos else ''
    payload = {
        'sec_uid': sec_uid,
        'nickname': nickname,
        'matched_account': match_account_by_sec_uid(sec_uid),
        'fetched_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'count': len(videos),
        'videos': videos,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if out_path:
        out_path.write_text(text)
        print(f'✓ 写入 {out_path} | {len(videos)} 条 | {nickname or sec_uid[:20]}')
    else:
        print(text)


if __name__ == '__main__':
    main()

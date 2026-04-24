"""douyin-toolkit 公共：Cookie 复用 DouK，sec_uid 解析，f2 client 构造"""
import json, re, asyncio, os
from pathlib import Path
from urllib.parse import urlparse

DOUK_SETTINGS = Path.home() / 'Applications/TikTokDownloader/_internal/Volume/settings.json'
ACCOUNTS_JSON = Path.home() / '.xugongzi-toolkit/my_accounts.json'

# f2 默认在 cwd 下创建 logs/，会污染调用者目录（特别是 vault 根）
# → 提供 context manager，f2 调用前临时 chdir 到 toolkit 自己的缓存目录
_TOOLKIT_HOME = Path.home() / '.cache' / 'douyin-toolkit'
_TOOLKIT_HOME.mkdir(parents=True, exist_ok=True)


class f2_workdir:
    """with f2_workdir(): ... 包住所有 f2 异步调用"""
    def __enter__(self):
        self._prev = Path.cwd()
        os.chdir(_TOOLKIT_HOME)
        return self
    def __exit__(self, *a):
        os.chdir(self._prev)


def load_cookie():
    s = json.loads(DOUK_SETTINGS.read_text())
    d = s.get('cookie') or {}
    if isinstance(d, str):
        return d
    return '; '.join(f'{k}={v}' for k, v in d.items())


def f2_kwargs(mode='post'):
    return {
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/',
        },
        'cookie': load_cookie(),
        'proxies': {'http://': None, 'https://': None},
        'timeout': 25,
        'mode': mode,
    }


def load_my_accounts():
    if ACCOUNTS_JSON.exists():
        return json.loads(ACCOUNTS_JSON.read_text())
    return {}


def match_account_by_sec_uid(sec_uid):
    for name, info in load_my_accounts().items():
        if info.get('sec_uid') == sec_uid:
            return name
    return None


async def resolve_sec_uid(url_or_sec_uid):
    """短链 / 长链 / sec_uid 字符串都接受，返回 sec_uid"""
    s = url_or_sec_uid.strip()
    if s.startswith('MS4wLj'):
        return s
    # 先查本地账号本
    for name, info in load_my_accounts().items():
        for sl in info.get('short_links', []):
            if sl.strip().rstrip('/') == s.rstrip('/'):
                return info['sec_uid']
    # 解析短链 / 长链
    from f2.apps.douyin.handler import DouyinHandler
    h = DouyinHandler(f2_kwargs())
    if 'v.douyin.com' in s:
        # 短链跳转拿真实 URL
        import httpx
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
            r = await c.get(s, headers={'User-Agent': 'Mozilla/5.0'})
            s = str(r.url)
    m = re.search(r'/user/([^?/]+)', s)
    if m:
        return m.group(1)
    raise ValueError(f'无法解析 sec_uid: {url_or_sec_uid}')


def normalize_video(item, raw=None):
    """f2 _to_list 项 + raw_data 中对应 aweme，合成统一字段"""
    stats = (raw or {}).get('statistics', {}) if raw else {}
    text_extra = (raw or {}).get('text_extra', []) if raw else []
    topics = [t.get('hashtag_name', '') for t in text_extra if t.get('hashtag_name')]
    ct = item.get('create_time', '')
    # f2 用 - 分隔，统一改成抖音原版 :
    if ct and ' ' in ct:
        d, t = ct.split(' ', 1)
        ct = f'{d} {t.replace("-", ":")}'
    play_addrs = item.get('video_play_addr') or []
    return {
        'aweme_id': str(item.get('aweme_id', '')),
        'desc': item.get('desc_raw') or item.get('desc', ''),
        'create_time': ct,
        'duration_ms': item.get('video_duration', 0),
        'cover': item.get('cover', ''),
        'video_url': play_addrs[0] if play_addrs else '',
        'music_url': item.get('music_play_url', ''),
        'nickname': item.get('nickname_raw') or item.get('nickname', ''),
        'sec_user_id': item.get('sec_user_id', ''),
        'topics': topics,
        'digg_count': stats.get('digg_count', 0),
        'comment_count': stats.get('comment_count', 0),
        'collect_count': stats.get('collect_count', 0),
        'share_count': stats.get('share_count', 0),
        'play_count': stats.get('play_count', 0),
        'share_url': f'https://www.douyin.com/video/{item.get("aweme_id", "")}',
    }

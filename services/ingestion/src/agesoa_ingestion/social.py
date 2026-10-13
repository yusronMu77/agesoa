"""Social posts shared by reporters as extra evidence (no scraping: only what the reporter pastes).

A post is stored as a canonical link without the poster's username, the platform and an optional short excerpt
typed or pasted by the reporter (handles masked). Reposts and tracking variants of the same post map to one
canonical URL, so they become one shared post.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

MAX_URL = 2048
MAX_EXCERPT = 280
_HANDLE = re.compile(r"(?<![\w.])@[\w.]{2,30}")


class InvalidPostUrl(ValueError):
    pass


@dataclass(frozen=True)
class CanonicalPost:
    url: str
    platform: str


def canonical_post(raw: str) -> CanonicalPost:
    value = raw.strip()
    if len(value) > MAX_URL:
        raise InvalidPostUrl("link is too long")
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname or " " in value:
        raise InvalidPostUrl("not a web link (expected https://...)")
    host = parts.hostname.lower().removeprefix("www.").removeprefix("m.").removeprefix("mobile.")
    segments = [s for s in parts.path.split("/") if s]
    for matcher in _MATCHERS:
        result = matcher(host, segments, parts.query)
        if result:
            return result
    # Any other site: keep scheme + host + path; query and fragment are dropped (tracking, session ids).
    path = "/" + "/".join(segments) if segments else "/"
    return CanonicalPost(f"https://{host}{path}", "web")


def mask_handles(excerpt: str | None) -> str | None:
    """Short excerpt with @handles masked; None when empty."""
    if not excerpt or not excerpt.strip():
        return None
    text = _HANDLE.sub("@…", " ".join(excerpt.split()))
    return text if len(text) <= MAX_EXCERPT else text[: MAX_EXCERPT - 1] + "…"


def _x(host: str, seg: list[str], query: str) -> CanonicalPost | None:
    if host not in ("x.com", "twitter.com"):
        return None
    if "status" in seg and seg.index("status") + 1 < len(seg):
        return CanonicalPost(f"https://x.com/i/status/{seg[seg.index('status') + 1]}", "x")
    return None


def _instagram(host: str, seg: list[str], query: str) -> CanonicalPost | None:
    if host != "instagram.com":
        return None
    for kind in ("p", "reel", "reels", "tv"):
        if kind in seg and seg.index(kind) + 1 < len(seg):
            code = seg[seg.index(kind) + 1]
            return CanonicalPost(
                f"https://www.instagram.com/{'reel' if kind == 'reels' else kind}/{code}/", "instagram"
            )
    return None


def _tiktok(host: str, seg: list[str], query: str) -> CanonicalPost | None:
    if host not in ("tiktok.com", "vt.tiktok.com", "vm.tiktok.com"):
        return None
    if "video" in seg and seg.index("video") + 1 < len(seg):
        return CanonicalPost(f"https://www.tiktok.com/@/video/{seg[seg.index('video') + 1]}", "tiktok")
    if host != "tiktok.com" and seg:  # short share link
        return CanonicalPost(f"https://{host}/{seg[0]}/", "tiktok")
    return None


def _youtube(host: str, seg: list[str], query: str) -> CanonicalPost | None:
    video = None
    if host == "youtu.be" and seg:
        video = seg[0]
    elif host in ("youtube.com", "music.youtube.com"):
        if seg[:1] == ["watch"]:
            video = (parse_qs(query).get("v") or [None])[0]
        elif seg[:1] in (["shorts"], ["live"]) and len(seg) > 1:
            video = seg[1]
    return CanonicalPost(f"https://www.youtube.com/watch?v={video}", "youtube") if video else None


def _threads(host: str, seg: list[str], query: str) -> CanonicalPost | None:
    if host not in ("threads.net", "threads.com"):
        return None
    if "post" in seg and seg.index("post") + 1 < len(seg):
        return CanonicalPost(f"https://www.threads.net/@/post/{seg[seg.index('post') + 1]}", "threads")
    return None


def _facebook(host: str, seg: list[str], query: str) -> CanonicalPost | None:
    if host not in ("facebook.com", "fb.com", "fb.watch"):
        return None
    q = parse_qs(query)
    if seg[:1] == ["permalink.php"] and "story_fbid" in q:
        return CanonicalPost(f"https://www.facebook.com/{q['story_fbid'][0]}", "facebook")
    for kind in ("posts", "videos", "reel"):
        if kind in seg and seg.index(kind) + 1 < len(seg):
            return CanonicalPost(f"https://www.facebook.com/{kind}/{seg[seg.index(kind) + 1]}", "facebook")
    if seg[:1] == ["share"] and len(seg) > 1:
        return CanonicalPost(f"https://www.facebook.com/{'/'.join(seg)}/", "facebook")
    return None


_MATCHERS = (_x, _instagram, _tiktok, _youtube, _threads, _facebook)

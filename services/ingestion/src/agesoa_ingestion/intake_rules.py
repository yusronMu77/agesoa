"""Rule-based extraction from free text, driven by a domain pack's `intake_hints` (no domain words here).

Fallback for Agen Intake when no LLM is configured (local, or demo_mode): it reads only the typed narrative, not
photos or audio. Times are Indonesian clock expressions ("jam 3 pagi", "pukul 03.10", "jam setengah sepuluh"),
resolved on the report's local date.
"""

from __future__ import annotations

import re
from datetime import datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from agesoa_packs import DomainPack

TZ = ZoneInfo("Asia/Jakarta")
_NUMBER_WORDS = {
    "satu": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5, "enam": 6, "tujuh": 7, "delapan": 8,
    "sembilan": 9, "sepuluh": 10, "sebelas": 11, "dua belas": 12,
}  # fmt: skip
_HOUR = r"(\d{1,2})(?:[.:](\d{2}))?|" + "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True))
_CLOCK = re.compile(
    rf"(?:jam|pukul|pkl\.?)\s+(setengah\s+)?({_HOUR})(?:\s+(pagi|siang|sore|malam))?"
    rf"|\b(\d{{1,2}})[.:](\d{{2}})\b(?:\s+(pagi|siang|sore|malam))?",
    re.IGNORECASE,
)
_WINDOW = 40  # characters after a keyword in which its clock time must start


def extract(pack: DomainPack, narrative: str, received_at: datetime) -> dict[str, Any]:
    """{"category": id | None, "fields": {...}} from the narrative; unknown values are left out."""
    hints = pack.document.get("intake_hints", {})
    text = " ".join(narrative.split())
    lower = text.lower()
    day = received_at.astimezone(TZ).date()
    fields: dict[str, Any] = {}
    for field_id, hint in hints.get("fields", {}).items():
        value = None
        if "pattern" in hint:
            match = re.search(hint["pattern"], text)
            value = match.group(0).strip() if match else None
        elif "time_after" in hint:
            value = _time_after(lower, hint["time_after"], day)
        elif "number_before" in hint:
            value = _number_before(lower, hint["number_before"])
        elif "vocabulary" in hint:
            found = [
                canon for canon, words in hint["vocabulary"].items() if any(_has(lower, w) for w in words)
            ]
            value = found or None
        if value is not None:
            fields[field_id] = value
    return {"category": _category(lower, hints.get("categories", {})), "fields": fields}


def _has(lower: str, word: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(word.lower())}", lower) is not None


def _category(lower: str, categories: dict[str, list[str]]) -> str | None:
    scores = {cid: sum(_has(lower, w) for w in words) for cid, words in categories.items()}
    best = max(scores.items(), key=lambda kv: kv[1], default=(None, 0))
    return best[0] if best[1] > 0 else None


def _time_after(lower: str, keywords: list[str], day) -> str | None:
    for keyword in keywords:
        for kw in re.finditer(rf"(?<!\w){re.escape(keyword.lower())}(?!\w)", lower):
            match = _CLOCK.search(lower, kw.end(), kw.end() + _WINDOW)
            if match and match.start() - kw.end() <= _WINDOW // 2:
                clock = _clock(match)
                if clock:
                    return datetime.combine(day, clock, tzinfo=TZ).isoformat()
    return None


def _clock(m: re.Match[str]) -> time | None:
    if m.group(2):  # "jam ..." / "pukul ..."
        half, raw, period = m.group(1), m.group(2), m.group(5)
        hour = int(m.group(3)) if m.group(3) else _NUMBER_WORDS[raw.strip().lower()]
        minute = int(m.group(4)) if m.group(4) else 0
        if half:  # "setengah sepuluh" = 09:30
            hour, minute = hour - 1, 30
    else:  # bare "03.10"
        hour, minute, period = int(m.group(6)), int(m.group(7)), m.group(8)
    period = (period or "").lower()
    if period in ("siang", "sore") and hour < 12 and not (period == "siang" and hour >= 10):
        hour += 12
    elif period == "malam" and hour < 12:
        hour = 0 if hour == 12 else hour + 12
    if not (0 <= hour < 24 and 0 <= minute < 60):
        return None
    return time(hour, minute)


def _number_before(lower: str, units: list[str]) -> int | None:
    unit = "|".join(re.escape(u.lower()) for u in units)
    words = "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True))
    match = re.search(rf"\b(\d{{1,5}}|{words})\s+(?:{unit})\b", lower)
    if not match:
        return None
    raw = match.group(1)
    return int(raw) if raw.isdigit() else _NUMBER_WORDS[raw]

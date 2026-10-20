"""Server-rendered HTML pages (plain HTML + inline CSS, no JavaScript). Every value is escaped.

Layout, text and colours follow the agesoa-uiux mockups SCR-080 (inbox) and SCR-081 (follow-up and right of
reply) with the portal-like shell of the agency dashboard; the UI text is Indonesian (agesoa-uiux/copy/microcopy.md).
"""

from html import escape
from typing import Any
from urllib.parse import urlencode

from sim_institution.assets import LOGO_MARK_PNG_BASE64
from sim_institution.models import DETAIL_MAX_LENGTH, STATUS_PRESETS

TITLE = "SIM Badan Gizi Kabupaten Sukamaju (fiktif)"
BAND_TEXT = "SIMULASI – organisasi fiktif"  # TXT-SIM-001
ORG_NAME = "Dinas Contoh (simulasi)"
ORG_REGION = "Kabupaten Sukamaju"

# Follow-up status of a ticket: "new" until a status is sent to AGESOA (labels as on the public dashboard).
STATUS_LABELS = {"new": "Baru", "received": "Diterima", "in_progress": "Sedang dikerjakan", "done": "Selesai"}
SENDABLE_STATUSES = ("received", "in_progress", "done")
# Options of the SCR-081 select: (form value, label). Presets (models.STATUS_PRESETS) sit after their status;
# a preset's label is the status detail it sends (mockup: "Pemeriksaan ulang dijadwalkan").
STATUS_OPTIONS = [
    option
    for value in SENDABLE_STATUSES
    for option in [
        (value, STATUS_LABELS[value]),
        *((key, detail) for key, (status, detail) in STATUS_PRESETS.items() if status == value),
    ]
]
# Follow-up sentence of an answered inbox card (SCR-080 mockup "Tindak lanjut sedang berjalan.").
FOLLOW_UP = {
    "received": "Tindak lanjut belum dimulai.",
    "in_progress": "Tindak lanjut sedang berjalan.",
    "done": "Tindak lanjut selesai.",
}
EVIDENCE = {  # status bukti, weakest first (TXT-EVD-001..003)
    "alleged": ("Dugaan", "help"),
    "supported": ("Didukung bukti", "file"),
    "proven": ("Terbukti", "shield"),
}
LOG_RESULTS = {"accepted": "Diterima", "duplicate": "Duplikat", "rejected": "Ditolak"}
TABS = (("perlu", "Perlu tanggapan"), ("sudah", "Sudah ditanggapi"), ("semua", "Semua"))  # TXT-SIM-011
MONTHS = ("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")

# Lucide icons (stroke 2 px, 24 px grid), as in the design system.
ICONS = {
    "inbox": '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "send": '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    "activity": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    "right": '<path d="m9 18 6-6-6-6"/>',
    "down": '<path d="m6 9 6 6 6-6"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "file": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    "help": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "tablet": '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
}

# Colours, type and radii follow the AGESOA design tokens 0.4.0 (agesoa-uiux/design-system/tokens.json), copied as
# plain values: this fictional system has no build step and loads nothing from AGESOA. Fonts come from Google Fonts
# when reachable, otherwise the system font is used.
STYLE = """
:root{--primary:#6D151A;--primary-hover:#561014;--primary-subtle:#F7E6E1;--on-primary:#FFFBF1;--accent:#B44819;
--accent-subtle:#FBE9DD;--text:#2A1A18;--muted:#6B5651;--border:#E4D5C8;--border-strong:#6B5651;--surface:#FFFFFF;
--canvas:#FEFAF0;--band:#7C2D12;--info:#1D4ED8;--info-bg:#DBEAFE;--warning:#B45309;--warning-bg:#FEF3C7;
--success:#15803D;--success-bg:#DCFCE7;--danger:#B91C1C;--danger-bg:#FEE2E2;
--sans:"IBM Plex Sans","Segoe UI",Roboto,system-ui,sans-serif;--mono:"IBM Plex Mono",Consolas,ui-monospace,monospace}
*{box-sizing:border-box}
html{background:var(--canvas)}
body{margin:0;font-family:var(--sans);color:var(--text);background:var(--canvas);font-size:16px;line-height:1.5}
h1,h2,h3,p{margin:0}
a{color:var(--primary);text-underline-offset:3px}
a:hover{color:var(--primary-hover)}
:focus-visible{outline:3px solid var(--primary);outline-offset:2px;border-radius:4px}
svg.i{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;
stroke-linejoin:round}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);
white-space:nowrap;border:0}
.sim-band{background:var(--band);color:#FFFFFF;font-weight:700;font-size:14px;line-height:20px;min-height:34px;
padding:7px 16px;display:flex;align-items:center;justify-content:center;gap:8px;text-align:center;
border-bottom:1px solid #E0CEC1}
.sim-band svg.i{width:16px;height:16px}
.shell{display:grid;grid-template-columns:264px minmax(0,1fr);min-height:calc(100vh - 35px)}
.side{background:var(--surface);border-right:1px solid var(--border);border-left:1px solid var(--border);
padding:0 15px 26px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;height:63px;margin-top:7px;padding-left:10px;color:var(--text);
text-decoration:none;font-size:20px;line-height:28px;width:max-content}
.brand img{width:28px;height:24px}
.role{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;background:#FFEDD5;color:var(--text);
font-size:12px;line-height:16px;border-radius:9999px;padding:5px 10px 5px 8px;margin:7px 0 23px 1px}
.role svg.i{width:16px;height:16px;stroke:#C2410C}
.nav{display:flex;flex-direction:column;gap:4px}
.nav a{display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;border-radius:8px;color:var(--text);
text-decoration:none;font-size:14px;line-height:20px}
.nav a:hover{background:#FBF3EC}
.nav a[aria-current="page"]{background:var(--primary-subtle);color:var(--primary)}
.org{margin-top:auto;display:flex;align-items:center;gap:12px;background:var(--canvas);border-radius:8px;
padding:11px 8px}
.org .ic{width:40px;height:40px;border-radius:9999px;background:var(--accent-subtle);color:var(--accent);
display:grid;place-items:center;flex:none}
.org strong{display:block;font-weight:400;font-size:14px;line-height:20px}
.org span{display:block;font-size:12px;line-height:18px;color:var(--muted)}
.col{min-width:0;display:flex;flex-direction:column}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);min-height:81px;padding:11px 31px 11px 32px;
display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.topbar .end{margin-left:auto;display:flex;align-items:center;gap:8px}
.picker{position:relative}
.picker>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;
gap:12px;width:240px;max-width:100%;height:58px;padding:8px 16px 8px 16px;border:1px solid var(--border);
border-radius:8px;background:var(--surface)}
.picker>summary::-webkit-details-marker{display:none}
.picker small{display:block;font-size:12px;line-height:16px;color:var(--muted)}
.picker b{display:block;font-weight:400;font-size:16px;line-height:24px;white-space:nowrap;overflow:hidden;
text-overflow:ellipsis}
.picker>summary>span{min-width:0}
.picker svg.i{width:16px;height:16px}
.menu{position:absolute;z-index:5;top:calc(100% + 4px);left:0;min-width:100%;background:var(--surface);
border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px #0F172A26;padding:4px;margin:0;
list-style:none}
.menu a{display:flex;align-items:center;min-height:40px;padding:0 12px;border-radius:6px;color:var(--text);
text-decoration:none;font-size:14px;white-space:nowrap}
.menu a:hover{background:var(--primary-subtle)}
.menu a[aria-current="true"]{color:var(--primary);font-weight:500}
.lang>summary{width:92px;height:40px;border-radius:9999px;padding:0 12px;gap:0}
.lang>summary .globe{margin-right:8px;display:flex}
.lang>summary .code{font-size:14px;line-height:20px;color:var(--muted);margin-right:auto}
.lang .menu{left:auto;right:0}
.bell{width:40px;height:40px;border:1px solid var(--border);border-radius:9999px;display:grid;place-items:center;
color:var(--text)}
.bell svg.i{width:18px;height:18px}
main{padding:32px 32px 32px;max-width:1176px;width:100%}
.lead{color:var(--muted);margin-top:3px}
h1{font-weight:400;font-size:24px;line-height:30px}
h2{font-weight:400;font-size:20px;line-height:28px}
.callout{display:flex;gap:16px;border-radius:8px;padding:12px 16px;font-size:14px;line-height:22px}
.callout svg.i{width:18px;height:18px;margin-top:2px}
.callout .t{display:block}
.callout.warning{background:var(--warning-bg);margin-top:26px}
.callout.warning svg.i,.callout.warning .t{color:var(--warning)}
.callout.info{background:var(--info-bg);margin-top:16px;padding:12px 16px 14px}
.callout.info svg.i,.callout.info .t{color:var(--info)}
.callout.ok{background:var(--success-bg)}
.callout.ok svg.i,.callout.ok .t{color:var(--success)}
.callout.error{background:var(--danger-bg)}
.callout.error svg.i,.callout.error .t{color:var(--danger)}
.result{margin:0 0 24px}
.tabs{display:flex;flex-wrap:wrap;gap:9px;margin:24px 0 24px;padding:0;list-style:none}
.tabs a{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px 0 12px;border:1px solid
var(--border-strong);border-radius:9999px;color:var(--text);text-decoration:none;font-size:14px;line-height:20px;
background:var(--surface)}
.tabs a:not([aria-current]){padding:0 16px}
.tabs a[aria-current="page"]{background:var(--primary-subtle);border-color:var(--primary);color:var(--primary)}
.tabs svg.i{width:16px;height:16px}
.cards{display:flex;flex-direction:column;gap:16px;margin:0;padding:0;list-style:none}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px}
.finding{padding:15px 24px 13px;min-height:150px}
.finding .top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;min-height:28px}
.finding .meta{font-size:12px;line-height:16px;color:var(--muted);margin-right:26px}
.finding h2{margin-top:9px}
.finding .desc{font-size:14px;line-height:20px;color:var(--muted);margin-top:4px}
.finding .bottom{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}
.loc{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:16px;color:var(--muted)}
.loc svg.i{width:14px;height:14px}
.open{display:inline-flex;align-items:center;gap:18px;min-height:24px;font-size:14px;line-height:20px;
text-decoration:none;margin-right:2px}
.open svg.i{width:16px;height:16px;color:var(--text)}
.badges{display:flex;flex-wrap:wrap;gap:8px}
.badge{display:inline-flex;align-items:center;gap:6px;height:28px;border-radius:9999px;padding:0 15px 0 13px;
font-size:14px;line-height:20px;color:var(--text);border:1px solid transparent;white-space:nowrap}
.badge svg.i{width:14px;height:14px}
.badge.alleged{background:#FEF9C3;border-color:#FDE68A}
.badge.supported{background:#DBEAFE;border-color:#BFDBFE}
.badge.proven{background:#DCFCE7;border-color:#BBF7D0}
.badge.test{background:#F7EFE3;border-color:var(--border)}
.badge.synthetic{background:#FFEDD5;border-color:#FED7AA}
.empty{padding:24px}
.crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:22px;font-size:14px;line-height:20px;color:var(--muted);
margin:0 0 24px;padding:0;list-style:none}
.crumbs a{text-decoration:none}
.crumbs li+li::before{content:"/";margin-right:12px;color:var(--muted)}
.headline{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-bottom:8px}
.headline .ticket{font-size:14px;line-height:20px;color:var(--accent)}
.headline .ticket strong{font-weight:500}
.cols{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;margin-top:24px;align-items:start}
@media (min-width:1100px){.cols{grid-template-columns:minmax(0,568fr) minmax(0,520fr)}}
.panel{padding:20px 24px 23px}
.panel h2{margin-bottom:12px}
.panel p.body{line-height:27px}
.panel h3{font-weight:500;font-size:14px;line-height:20px;margin:16px 0 4px}
.panel ul{margin:0;padding-left:20px;font-size:14px;line-height:22px;color:var(--muted)}
.cause{border:1px solid var(--border-strong);border-radius:16px;padding:15px 17px 19px;margin-top:12px}
.cause+.cause{margin-top:16px}
.cause .top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.cause .lab{font-size:12px;line-height:16px;color:var(--muted)}
.cause .stmt{margin-top:8px}
.cause .ev{font-size:14px;line-height:20px;color:var(--muted);margin-top:8px}
.cause .basis{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:16px;margin-top:8px;
min-height:24px;text-decoration:none}
.cause .basis svg.i{width:14px;height:14px;color:var(--text)}
label{display:block;font-size:14px;line-height:20px;margin:14px 0 4px}
.hint{font-size:12px;line-height:18px;color:var(--muted);margin-top:4px}
.select{position:relative}
.select svg.i{position:absolute;right:16px;top:12px;width:16px;height:16px;pointer-events:none}
select,input,textarea{font:inherit;font-size:16px;color:var(--text);background:var(--surface);width:100%;
border:1px solid var(--border-strong);border-radius:8px}
select{appearance:none;height:40px;padding:0 44px 0 13px}
input{height:40px;padding:0 13px}
textarea{display:block;min-height:121px;padding:7px 13px;line-height:26px;resize:vertical}
.btn{font:inherit;font-size:14px;line-height:20px;display:flex;align-items:center;justify-content:center;
width:100%;min-height:41px;padding:0 16px;border-radius:8px;cursor:pointer;text-decoration:none}
.btn.outline{background:var(--surface);color:var(--text);border:1px solid var(--border-strong)}
.btn.outline:hover{background:#FBF3EC}
.btn.primary{background:var(--primary);color:var(--on-primary);border:0;font-weight:600}
.btn.primary:hover{background:var(--primary-hover)}
.attach{margin-top:19px}
.attach>summary{list-style:none}
.attach>summary::-webkit-details-marker{display:none}
.attach[open]>summary{margin-bottom:4px}
.form-end{margin-top:16px}
.foot{font-size:12px;line-height:20px;color:var(--muted);margin-top:14px}
.sent{margin-bottom:16px}
.sent p+p{margin-top:4px}
.dialog{width:min(380px,calc(100vw - 32px));border:1px solid var(--border);border-radius:16px;padding:24px;
background:var(--surface);color:var(--text)}
.dialog::backdrop{background:#2B0A0D80}
.dialog h2{font-size:24px;line-height:32px;margin:6px 0 12px}
.dialog p{color:var(--muted);line-height:24px}
.dialog .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:28px}
.dialog .btn{font-size:16px;min-height:48px;font-weight:400}
.table-wrap{overflow-x:auto;margin-top:24px}
table{border-collapse:separate;border-spacing:0;width:100%;background:var(--surface);font-size:14px;line-height:20px}
th,td{padding:12px 16px;text-align:left;vertical-align:top;border-top:1px solid var(--border)}
thead th{background:#F7EFE3;color:var(--muted);font-weight:500;border-top:0;white-space:nowrap}
td code{font-family:var(--mono);font-size:13px}
.settings{max-width:640px;margin-top:24px}
.settings .btn{margin-top:24px}
.links{margin-top:16px;font-size:14px}
@media (max-width:899px){
.shell{grid-template-columns:minmax(0,1fr)}
.side{border-right:0;border-left:0;border-bottom:1px solid var(--border);padding:0 16px 12px}
.brand{margin-top:0;height:56px;padding-left:4px}
.role{margin:0 0 8px}
.nav{flex-direction:row;flex-wrap:wrap}
.nav a{padding:0 10px;gap:8px}
.org{display:none}
.topbar{padding:12px 16px}
.picker>summary{width:calc(50vw - 30px);min-width:150px}
.topbar .end{margin-left:0}
main{padding:24px 16px}
.finding{padding:16px}
.finding .meta{margin-right:0}
.panel{padding:20px 16px}
}
@media (max-width:399px){.picker,.picker>summary{width:100%}}
"""


def _e(value: Any) -> str:
    return escape("" if value is None else str(value))


def icon(name: str) -> str:
    return f'<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[name]}</svg>'


def format_date(iso: str | None) -> str:
    """``2026-10-19T08:00:00Z`` → ``19 Okt 2026``; anything else is shown as given."""
    if not iso or len(iso) < 10 or iso[4] != "-" or iso[7] != "-":
        return iso or ""
    try:
        year, month, day = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
        return f"{day} {MONTHS[month - 1]} {year}"
    except (ValueError, IndexError):
        return iso


def humanize(code: str | None) -> str:
    """Category codes from the webhook (``food_poisoning``) as readable text; free text stays as given."""
    text = (code or "").replace("_", " ").strip()
    return text[:1].upper() + text[1:]


def strongest_evidence(case: dict[str, Any]) -> str | None:
    statuses = [c.get("status") for c in case.get("root_causes", [])]
    ranked = [s for s in EVIDENCE if s in statuses]
    return ranked[-1] if ranked else None


def evidence_badge(status: str | None) -> str:
    if status not in EVIDENCE:
        return ""
    label, icon_name = EVIDENCE[status]
    return f'<span class="badge {status}" data-evidence="{status}">{icon(icon_name)}{label}</span>'


def test_badge(item: dict[str, Any]) -> str:
    return '<span class="badge test">Event uji</span>' if item["event"] == "test_event" else ""


def is_open(item: dict[str, Any]) -> bool:
    """ "Perlu tanggapan": the follow-up is not finished yet."""
    return item["status"] != "done"


def is_answered(item: dict[str, Any]) -> bool:
    return bool(item.get("reply"))


def selected_option(item: dict[str, Any]) -> str:
    """The select value matching the sent status: its preset when the sent detail is a preset's detail."""
    status = item["status"] if item["status"] in SENDABLE_STATUSES else "received"
    detail = item.get("detail")
    return next((k for k, (st, d) in STATUS_PRESETS.items() if st == status and d == detail), status)


def sent_status(item: dict[str, Any]) -> str:
    """ "Sedang dikerjakan · Pemeriksaan ulang dijadwalkan": the sent status with its detail, if any."""
    label = STATUS_LABELS.get(item["status"], item["status"])
    return " · ".join(x for x in (label, item.get("detail")) if x)


def _query(**params: str | None) -> str:
    clean = {k: v for k, v in params.items() if v}
    return "/?" + urlencode(clean) if clean else "/"


def _picker(label: str, value: str, options: list[tuple[str, str, bool]], extra: str = "") -> str:
    links = "".join(
        f'<li><a href="{_e(href)}"{' aria-current="true"' if current else ""}>{_e(text)}</a></li>'
        for text, href, current in options
    )
    return (
        f'<details class="picker{extra}"><summary><span><small>{_e(label)}</small><b>{_e(value)}</b></span>'
        f'{icon("down")}</summary><ul class="menu">{links}</ul></details>'
    )


def topbar(filters: dict[str, Any]) -> str:
    """Context pickers (Jenis masalah, Wilayah) filter the inbox; language picker and log shortcut."""
    tab = filters.get("tab")
    category = filters.get("category")
    region = filters.get("region")
    categories = filters.get("categories", [])
    regions = [r for r in filters.get("regions", []) if r != ORG_REGION]
    cat_options = [("Semua jenis masalah", _query(tab=tab, region=region), not category)]
    cat_options += [
        (humanize(c), _query(tab=tab, category=c, region=region), c == category) for c in categories
    ]
    reg_options = [(ORG_REGION, _query(tab=tab, category=category), not region)]
    reg_options += [(r, _query(tab=tab, category=category, region=r), r == region) for r in regions]
    cat_value = filters.get("category_label") or (humanize(category) if category else "Semua jenis masalah")
    lang = (
        '<details class="picker lang"><summary>'
        f'<span class="globe">{icon("globe")}</span><span class="sr-only">Bahasa: </span><span class="code">ID</span>'
        f"{icon('down')}"
        '</summary><ul class="menu"><li><a href="?" aria-current="true" lang="id">Bahasa Indonesia</a></li></ul>'
        "</details>"
    )
    return (
        '<header class="topbar">'
        + _picker("Jenis masalah", cat_value, cat_options)
        + _picker("Wilayah", region or ORG_REGION, reg_options)
        + f'<div class="end">{lang}<a class="bell" href="/webhook-log" aria-label="Log webhook">{icon("bell")}</a></div>'
        "</header>"
    )


NAV = (
    ("inbox", "/", "inbox", "Temuan masuk"),
    ("staff", "/staff", "users", "Konfirmasi staf"),
    ("replies", "/replies", "send", "Hak jawab"),
    ("integration", "/settings", "activity", "Integrasi"),
)


def layout(page_title: str, body: str, *, active: str, filters: dict[str, Any] | None = None) -> str:
    nav = "".join(
        f'<a href="{href}"{' aria-current="page"' if key == active else ""}>{icon(ic)}{label}</a>'
        for key, href, ic, label in NAV
    )
    return f"""<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(page_title)} · {_e(TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>{STYLE}</style>
</head>
<body>
<div class="sim-band" role="note" data-testid="sim-band">{icon("info")}<span>{_e(BAND_TEXT)}</span></div>
<div class="shell">
<aside class="side" aria-label="Navigasi">
<a class="brand" href="/"><img src="data:image/png;base64,{LOGO_MARK_PNG_BASE64}" alt="">AGESOA</a>
<span class="role">{icon("tablet")}Instansi</span>
<nav class="nav" aria-label="Menu utama">{nav}</nav>
<div class="org"><span class="ic">{icon("tablet")}</span><span><strong>{_e(ORG_NAME)}</strong>
<span>Terverifikasi lewat domain</span></span></div>
</aside>
<div class="col">
{topbar(filters or {})}
<main>
{body}
</main>
</div>
</div>
</body>
</html>
"""


def _finding_card(item: dict[str, Any]) -> str:
    case = item["case"]
    ticket = _e(item["ticket"])
    received = format_date(item.get("received_at"))
    # SCR-080 card text. The mockup's "Tenggat hak jawab {tanggal}" needs a reply deadline the webhook does not carry,
    # so an open card says when it was received; the internal ticket stays on the link (screen readers) and the
    # ticket page.
    if is_answered(item):
        follow_up = FOLLOW_UP.get(item["status"], f"Tindak lanjut: {_e(item['status'])}.")
        if item.get("detail"):
            follow_up += f' <span data-testid="status-detail">Keterangan: {_e(item["detail"])}.</span>'
        desc = f"Sudah ditanggapi {_e(format_date(item['reply'].get('sent_at')))}. {follow_up}"
    else:
        desc = f"Diterima {_e(received)}. Belum ada tanggapan dari organisasi Anda."
    meta = " · ".join(x for x in (_e(humanize(case.get("category"))), _e(case.get("id"))) if x)
    return f"""<li class="card finding" data-testid="inbox-item" data-event="{_e(item["event"])}" data-status="{_e(item["status"])}">
<div class="top"><span class="badges">{evidence_badge(strongest_evidence(case))}{test_badge(item)}</span>
<span class="meta">{meta}</span></div>
<h2>{_e(case.get("summary"))}</h2>
<p class="desc">{desc}</p>
<div class="bottom"><span class="loc">{icon("pin")}{_e(case.get("region"))}</span>
<a class="open" href="/tickets/{ticket}" data-testid="ticket-number">Buka dan tanggapi<span class="sr-only"> tiket {ticket}</span>{icon("right")}</a></div>
</li>"""


def _filters(items: list[dict[str, Any]], tab: str | None, category: str | None, region: str | None) -> dict:
    return {
        "tab": tab,
        "category": category,
        "region": region,
        "categories": sorted({i["case"].get("category") for i in items if i["case"].get("category")}),
        "regions": sorted({i["case"].get("region") for i in items if i["case"].get("region")}),
    }


def select_items(
    items: list[dict[str, Any]], tab: str, category: str | None = None, region: str | None = None
) -> list[dict[str, Any]]:
    """Tab "perlu" (default): follow-up not finished; "sudah": a right of reply was sent; "semua": everything."""
    if tab == "sudah":
        items = [i for i in items if is_answered(i)]
    elif tab != "semua":
        items = [i for i in items if is_open(i)]
    if category:
        items = [i for i in items if i["case"].get("category") == category]
    if region:
        items = [i for i in items if i["case"].get("region") == region]
    return items


def inbox_page(
    items: list[dict[str, Any]], tab: str = "perlu", category: str | None = None, region: str | None = None
) -> str:
    tab = tab if tab in dict(TABS) else "perlu"
    shown = select_items(items, tab, category, region)
    tabs = "".join(
        f'<li><a href="{_e(_query(tab=None if key == "perlu" else key, category=category, region=region))}"'
        f"{' aria-current="page"' if key == tab else ''}>{icon('check') if key == tab else ''}{label}</a></li>"
        for key, label in TABS
    )
    if shown:
        cards = '<ul class="cards">' + "".join(_finding_card(i) for i in shown) + "</ul>"
    else:
        empty = "Belum ada temuan masuk." if not items else "Tidak ada temuan untuk pilihan ini."
        cards = f'<p class="card empty">{empty}</p>'
    body = f"""<h1>Temuan masuk</h1>
<p class="lead">Temuan yang menyangkut organisasi Anda. Tanggapan diberikan sebelum tenggat hak jawab; tanggapan tampil apa adanya di samping temuan.</p>
<div class="callout warning" role="note">{icon("alert")}<p><span class="t">Simulasi: organisasi dan data fiktif</span>
Dinas ini rekaan untuk demo. Tidak ada instansi nyata yang menerima atau menanggapi temuan ini.</p></div>
<nav aria-label="Saring temuan"><ul class="tabs">{tabs}</ul></nav>
{cards}"""
    return layout("Temuan masuk", body, active="inbox", filters=_filters(items, tab, category, region))


def replies_page(items: list[dict[str, Any]]) -> str:
    answered = [i for i in items if is_answered(i)]
    cards = (
        '<ul class="cards">' + "".join(_finding_card(i) for i in answered) + "</ul>"
        if answered
        else '<p class="card empty">Belum ada tanggapan yang dikirim.</p>'
    )
    body = f"""<h1>Hak jawab</h1>
<p class="lead">Tanggapan resmi yang sudah dikirim ke AGESOA. Publik melihatnya di samping temuan, lengkap dengan waktunya.</p>
<div style="margin-top:24px">{cards}</div>"""
    return layout("Hak jawab", body, active="replies", filters=_filters(items, None, None, None))


def staff_page() -> str:
    body = """<h1>Konfirmasi staf</h1>
<p class="lead">Konfirmasi afiliasi staf dilakukan di portal AGESOA, bukan di sistem simulasi ini.</p>
<p class="card empty" style="margin-top:24px">Tidak ada staf yang menunggu konfirmasi.</p>"""
    return layout("Konfirmasi staf", body, active="staff")


def _result(api_result: dict[str, Any] | None) -> str:
    if api_result is None:
        return ""
    ok = api_result["ok"]
    kind, ic = ("ok", "check") if ok else ("error", "alert")
    lines = "".join(f"<br>{_e(line)}" for line in api_result.get("lines", []))
    return (
        f'<div class="callout {kind} result" role="status" data-testid="api-result" data-ok="{str(ok).lower()}">'
        f'{icon(ic)}<p><span class="t">{_e(api_result["action"])}</span>{_e(api_result["message"])}{lines}</p></div>'
    )


def _cause(cause: dict[str, Any], url: str) -> str:
    evidence = cause.get("evidence") or []
    ev = "Bukti: " + ", ".join(evidence) + "." if evidence else "Belum ada bukti yang dicantumkan."
    basis = (
        f'<a class="basis" href="{_e(url)}">{icon("file")}Lihat dasar temuan</a>'
        if url.startswith(("https://", "http://"))
        else ""
    )
    return f"""<div class="cause"><div class="top"><span class="lab">Penyebab</span>{evidence_badge(cause.get("status"))}</div>
<p class="stmt">{_e(cause.get("statement"))}</p>
<p class="ev">{_e(ev)}</p>
{basis}</div>"""


def _list(title: str, values: list[str]) -> str:
    if not values:
        return ""
    return f"<h3>{_e(title)}</h3><ul>" + "".join(f"<li>{_e(v)}</li>" for v in values) + "</ul>"


def ticket_page(item: dict[str, Any], api_result: dict[str, Any] | None = None) -> str:
    case = item["case"]
    ticket = _e(item["ticket"])
    url = str(case.get("url") or "")
    # Only http(s) links are rendered as links (no javascript: URLs from a webhook body).
    case_ref = (
        f'<a href="{_e(url)}">{_e(case.get("id"))}</a>'
        if url.startswith(("https://", "http://"))
        else _e(case.get("id"))
    )
    synthetic = " Data audit sintetis." if case.get("synthetic") else ""
    summary = (
        f"Laporan audit final dari AGESOA untuk kasus {case_ref} ({_e(humanize(case.get('category')))}, "
        f"domain {_e(case.get('domain'))}) di {_e(case.get('region'))}.{synthetic}"
    )
    causes = "".join(_cause(c, url) for c in case.get("root_causes", []))
    if not causes:
        causes = '<p class="ev">Belum ada akar masalah yang dicantumkan.</p>'
    current = selected_option(item)
    options = "".join(
        f'<option value="{_e(value)}"{" selected" if value == current else ""}>{_e(label)}</option>'
        for value, label in STATUS_OPTIONS
    )
    status_hint = ""
    if item["status"] in SENDABLE_STATUSES:
        status_hint = (
            f'<p class="hint" data-testid="sent-status">Status terkirim: {_e(sent_status(item))}</p>'
        )
    sent = ""
    if is_answered(item):
        sent = (
            f'<div class="callout ok sent">{icon("check")}<div><p><span class="t">Tanggapan terkirim '
            f"{_e(format_date(item['reply'].get('sent_at')))}</span>{_e(item['reply'].get('body'))}</p></div></div>"
        )
    body = f"""<ol class="crumbs" aria-label="Lokasi halaman"><li><a href="/">Temuan masuk</a></li><li aria-current="page">{ticket}</li></ol>
<div class="headline"><span class="badges">{evidence_badge(strongest_evidence(case))}{test_badge(item)}</span>
<span class="ticket">Tiket internal <strong data-testid="ticket-number">{ticket}</strong> · diterima {_e(format_date(item.get("received_at")))}</span></div>
<h1>{_e(case.get("summary"))}</h1>
<div class="cols">
<section class="card panel" aria-labelledby="summary-h">
<h2 id="summary-h">Ringkasan temuan</h2>
<p class="body">{summary}</p>
{causes}
{_list("Rekomendasi", case.get("recommendations", []))}
{_list("Validasi", case.get("validations", []))}
<div class="callout info" role="note">{icon("info")}<p><span class="t">Tanggapan Anda tampil apa adanya</span>
Kami tidak menyunting tanggapan. Publik melihatnya di samping temuan, lengkap dengan waktunya.</p></div>
</section>
<section class="card panel" aria-labelledby="respond-h">
<h2 id="respond-h">Tanggapan dan tindak lanjut</h2>
{_result(api_result)}{sent}
<form method="post" action="/tickets/{ticket}/respond" data-testid="respond-form">
<label for="status">Status tindak lanjut</label>
<div class="select"><select id="status" name="status" required>{options}</select>{icon("down")}</div>
{status_hint}
<label for="status-detail">Keterangan status (opsional)</label>
<input id="status-detail" name="detail" maxlength="{DETAIL_MAX_LENGTH}" autocomplete="off" aria-describedby="detail-hint">
<p class="hint" id="detail-hint">Satu baris, maksimal {DETAIL_MAX_LENGTH} karakter. Tampil publik apa adanya di samping temuan dan menggantikan keterangan dari pilihan status.</p>
<label for="reply-body">Tanggapan resmi</label>
<textarea id="reply-body" name="body" rows="4" aria-describedby="respond-foot"></textarea>
<details class="attach"><summary class="btn outline">Lampirkan dokumen</summary>
<label for="attachment-name">Nama dokumen</label>
<input id="attachment-name" name="attachment_name" autocomplete="off">
<label for="attachment-url">Tautan dokumen</label>
<input id="attachment-url" name="attachment_url" type="url" placeholder="https://" aria-describedby="attachment-hint">
<p class="hint" id="attachment-hint">Tautan https ke dokumen yang bisa dibuka publik. Hanya dikirim bersama tanggapan resmi.</p>
</details>
<div class="form-end"><button type="button" class="btn primary" popovertarget="confirm-send">Kirim tanggapan</button></div>
<div id="confirm-send" class="dialog" popover role="dialog" aria-labelledby="confirm-h" aria-describedby="confirm-b">
<h2 id="confirm-h">Terbitkan tanggapan resmi?</h2>
<p id="confirm-b">Tanggapan tampil atas nama organisasi, lengkap dengan waktu pengirimannya. Isi yang terkirim tidak dapat diubah. Periksa status tindak lanjut dan catatan Anda sebelum menerbitkan.</p>
<div class="row"><button type="button" class="btn outline" popovertarget="confirm-send" popovertargetaction="hide">Periksa lagi</button>
<button type="submit" class="btn primary" data-testid="confirm-send">Kirim tanggapan</button></div>
</div>
</form>
<p class="foot" id="respond-foot">Tanggapan dikirim atas nama organisasi, tercatat di log, dan tidak bisa diubah setelah terkirim.</p>
</section>
</div>"""
    filters = {
        "category": case.get("category"),
        "region": None,
        "category_label": humanize(case.get("category")),
    }
    return layout(f"Tiket {item['ticket']}", body, active="replies", filters=filters)


def log_page(entries: list[dict[str, Any]]) -> str:
    if entries:
        rows = "".join(
            f'<tr data-testid="webhook-log-row" data-result="{_e(e["result"])}">'
            f"<td>{_e(e['received_at'])}</td><td>{_e(LOG_RESULTS.get(e['result'], e['result']))}</td>"
            f"<td>{'<code>' + _e(e['reason']) + '</code>' if e['reason'] else ''}</td>"
            f"<td>{_e(e['event'] or '')}</td><td><code>{_e(e['event_id'] or '')}</code></td>"
            f"<td>{_e(e['ticket'] or '')}</td></tr>"
            for e in entries
        )
        content = (
            '<div class="table-wrap card"><table><caption class="sr-only">Permintaan webhook, terbaru di atas</caption>'
            '<thead><tr><th scope="col">Waktu diterima</th><th scope="col">Hasil</th><th scope="col">Alasan</th>'
            '<th scope="col">Event</th><th scope="col">ID event</th><th scope="col">Tiket</th></tr></thead>'
            f"<tbody>{rows}</tbody></table></div>"
        )
    else:
        content = '<p class="card empty" style="margin-top:24px">Belum ada permintaan webhook.</p>'
    body = f"""<h1>Log webhook</h1>
<p class="lead">Setiap permintaan webhook dari AGESOA, terbaru di atas: diterima, duplikat, atau ditolak beserta alasannya.</p>
{content}
<p class="links"><a href="/settings">Kembali ke pengaturan integrasi</a></p>"""
    return layout("Log webhook", body, active="integration")


def settings_page(view: dict[str, Any], saved: bool = False) -> str:
    secret_state = "sudah diatur" if view["webhook_secret_set"] else "belum diatur"
    key_state = "sudah diatur" if view["api_key_set"] else "belum diatur"
    notice = (
        f'<div class="callout ok result" role="status">{icon("check")}<p>Pengaturan disimpan.</p></div>'
        if saved
        else ""
    )
    body = f"""<h1>Integrasi</h1>
<p class="lead">Sambungkan sistem ini ke AGESOA untuk menerima temuan dan mengirim tindak lanjut. Pengaturan demo untuk sistem fiktif.</p>
<section class="card panel settings" aria-labelledby="settings-h">
<h2 id="settings-h">Pengaturan AGESOA</h2>
{notice}
<form method="post" action="/settings" data-testid="settings-form">
<label for="webhook_secret">Rahasia webhook</label>
<input id="webhook_secret" name="webhook_secret" type="password" autocomplete="off" aria-describedby="secret-state">
<p class="hint" id="secret-state">Saat ini {secret_state}. Kosongkan untuk mempertahankan nilai sekarang.</p>
<label for="api_key">API key</label>
<input id="api_key" name="api_key" type="password" autocomplete="off" aria-describedby="key-state">
<p class="hint" id="key-state">Saat ini {key_state}. Kosongkan untuk mempertahankan nilai sekarang.</p>
<label for="agesoa_api_url">URL API AGESOA</label>
<input id="agesoa_api_url" name="agesoa_api_url" type="url" value="{_e(view["agesoa_api_url"])}">
<label for="fail_next">Gagalkan pengiriman berikutnya</label>
<input id="fail_next" name="fail_next" type="number" min="0" value="{_e(view["fail_next"])}" aria-describedby="fail-hint">
<p class="hint" id="fail-hint">Jumlah webhook berikutnya yang dijawab 500, untuk menguji percobaan ulang AGESOA.</p>
<button type="submit" class="btn primary">Simpan pengaturan</button>
</form>
<p class="links"><a href="/webhook-log">Lihat log webhook</a></p>
</section>"""
    return layout("Integrasi", body, active="integration")

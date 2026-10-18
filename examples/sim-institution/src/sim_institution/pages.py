"""Server-rendered HTML pages (plain HTML + inline CSS, no JavaScript). Every value is escaped."""

from html import escape
from typing import Any

TITLE = "SIM Badan Gizi Kabupaten Sukamaju (fictional)"
BAND_TEXT = "SIMULASI – organisasi fiktif"  # TXT-SIM-001

# Colours, type and radii follow the AGESOA design tokens (packages/ui/tokens.css), copied as plain values: this
# fictional system has no build step and loads nothing from AGESOA.
STYLE = """
*{box-sizing:border-box}
body{margin:0;font-family:"IBM Plex Sans","Segoe UI",Roboto,system-ui,sans-serif;color:#2A1A18;background:#FEFAF0;
line-height:1.5;font-size:16px}
h1,h2{font-family:Saira,"Segoe UI",system-ui,sans-serif;line-height:1.25;margin:0 0 .75rem}
h1{font-size:2rem;font-weight:700}
h2{font-size:1.25rem;font-weight:500}
p{margin:0 0 .75rem}
.sim-band{background:#7C2D12;color:#FFFFFF;font-weight:700;text-align:center;padding:.5rem 1rem;letter-spacing:.02em;
font-size:.875rem}
header.app{background:#2B0A0D;color:#F3E3D8;border-bottom:1px solid #5A2B30;padding:.75rem 1.5rem;display:flex;
flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem 2rem}
header.app .name{font-family:Saira,"Segoe UI",system-ui,sans-serif;font-weight:600;font-size:1.125rem;margin:0}
header.app nav{display:flex;flex-wrap:wrap;gap:.25rem}
header.app nav a{color:#F3E3D8;text-decoration:none;padding:.5rem .875rem;border-radius:9999px}
header.app nav a:hover{background:#3A1519}
header.app :focus-visible{outline-color:#F3E3D8}
main{max-width:1280px;margin:0 auto;padding:2rem 1.5rem 3rem}
a{color:#6D151A;text-underline-offset:3px}
a:hover{color:#561014}
:focus-visible{outline:3px solid #6D151A;outline-offset:2px;border-radius:4px}
table{border-collapse:separate;border-spacing:0;width:100%;background:#fff;border:1px solid #E4D5C8;border-radius:16px;
overflow:hidden}
caption{text-align:left;padding:0 0 .75rem;color:#6B5651}
th,td{padding:1rem 1.5rem;text-align:left;vertical-align:middle;border-top:1px solid #E4D5C8}
thead th{background:#F7EFE3;color:#6B5651;font-size:.875rem;font-weight:500;border-top:0;padding:.75rem 1.5rem;
white-space:nowrap}
tbody td{color:#6B5651}
tbody td:first-child,tbody td:nth-child(5){color:#2A1A18}
td a[data-testid="ticket-number"]{font-weight:600}
tbody td:nth-child(2),tbody td:last-child{white-space:nowrap}
.badge{display:inline-flex;align-items:center;border-radius:9999px;padding:.125rem .625rem;font-size:.875rem;
font-weight:500;border:1px solid transparent;margin-left:.25rem}
.badge.alleged{background:#FEF9C3;color:#713F12;border-color:#FDE68A}
.badge.supported{background:#DBEAFE;color:#1E3A8A;border-color:#BFDBFE}
.badge.proven{background:#DCFCE7;color:#14532D;border-color:#BBF7D0}
.badge.test{background:#F7EFE3;color:#2A1A18;border-color:#E4D5C8}
.badge.synthetic{background:#FFEDD5;color:#9A3412;border-color:#FED7AA;margin-left:0}
.panel{background:#fff;border:1px solid #E4D5C8;border-radius:16px;padding:1.5rem;margin:0 0 1.5rem}
.panel ol,.panel ul{margin:0;padding-left:1.25rem;display:grid;gap:.5rem}
.panel li ul{margin-top:.5rem;color:#6B5651}
.cols{display:grid;grid-template-columns:minmax(0,1fr);gap:0 1.5rem;align-items:start}
@media (min-width:1024px){.cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
label{display:block;font-weight:500;font-size:.875rem;margin:1rem 0 .5rem}
label:first-of-type{margin-top:0}
input,select,textarea{font:inherit;padding:.625rem .75rem;width:100%;min-height:48px;background:#fff;color:#2A1A18;
border:1px solid #6B5651;border-radius:8px}
button{font:inherit;font-weight:600;margin-top:1rem;padding:.75rem 1.5rem;min-height:48px;width:100%;
background:#6D151A;color:#FFFBF1;border:0;border-radius:8px;cursor:pointer}
button:hover{background:#561014}
.result{background:#fff}
.result.ok{border-left:4px solid #15803D;background:#DCFCE7}
.result.error{border-left:4px solid #B91C1C;background:#FEE2E2}
"""

STATUS_LABELS = {"new": "New", "received": "Received", "in_progress": "In progress", "done": "Done"}


def _e(value: Any) -> str:
    return escape("" if value is None else str(value))


def layout(heading: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(TITLE)}</title>
<style>{STYLE}</style>
</head>
<body>
<div class="sim-band" role="note" data-testid="sim-band"><span lang="id">{_e(BAND_TEXT)}</span></div>
<header class="app">
<p class="name">{_e(TITLE)}</p>
<nav aria-label="Main"><a href="/">Inbox</a><a href="/webhook-log">Webhook log</a><a href="/settings">Settings</a></nav>
</header>
<main>
<h1>{_e(heading)}</h1>
{body}
</main>
</body>
</html>
"""


def inbox_page(items: list[dict[str, Any]]) -> str:
    if not items:
        return layout("Inbox: audit reports", "<p>No audit reports received yet.</p>")
    rows = []
    for item in items:
        case = item["case"]
        test = ' <span class="badge test">Test event</span>' if item["event"] == "test_event" else ""
        rows.append(
            f'<tr data-testid="inbox-item" data-event="{_e(item["event"])}">'
            f'<td><a href="/tickets/{_e(item["ticket"])}" data-testid="ticket-number">{_e(item["ticket"])}</a>{test}</td>'
            f"<td>{_e(case.get('id'))}</td><td>{_e(case.get('category'))}</td><td>{_e(case.get('region'))}</td>"
            f"<td>{_e(case.get('summary'))}</td><td>{_e(STATUS_LABELS.get(item['status'], item['status']))}</td>"
            f"<td>{_e(item['received_at'])}</td></tr>"
        )
    table = (
        "<table><caption>Audit reports received from AGESOA</caption><thead><tr>"
        '<th scope="col">Internal ticket</th><th scope="col">Case</th><th scope="col">Category</th>'
        '<th scope="col">Region</th><th scope="col">Summary</th><th scope="col">Follow-up status</th>'
        '<th scope="col">Received at</th></tr></thead><tbody>' + "".join(rows) + "</tbody></table>"
    )
    return layout("Inbox: audit reports", table)


def _list(values: list[str], empty: str) -> str:
    if not values:
        return f"<p>{_e(empty)}</p>"
    return "<ul>" + "".join(f"<li>{_e(v)}</li>" for v in values) + "</ul>"


def ticket_page(item: dict[str, Any], api_result: dict[str, Any] | None = None) -> str:
    case = item["case"]
    test = ' <span class="badge test">Test event</span>' if item["event"] == "test_event" else ""
    synthetic = (
        '<span class="badge synthetic">Synthetic data: yes</span>'
        if case.get("synthetic")
        else "<span>Synthetic data: no</span>"
    )
    causes = []
    for cause in case.get("root_causes", []):
        evidence = _list(cause.get("evidence", []), "No evidence listed.")
        causes.append(
            f'<li><span class="badge {_e(cause["status"])}">Evidence: {_e(cause["status"])}</span> '
            f"{_e(cause['statement'])}{evidence}</li>"
        )
    causes_html = "<ol>" + "".join(causes) + "</ol>" if causes else "<p>No root causes listed.</p>"

    result_html = ""
    if api_result is not None:
        kind = "ok" if api_result["ok"] else "error"
        result_html = (
            f'<div class="panel result {kind}" role="status" data-testid="api-result" data-ok="{str(api_result["ok"]).lower()}">'
            f"<strong>{_e(api_result['action'])}:</strong> {_e(api_result['message'])}</div>"
        )

    options = "".join(
        f'<option value="{value}"{" selected" if item["status"] == value else ""}>{label}</option>'
        for value, label in (("received", "Received"), ("in_progress", "In progress"), ("done", "Done"))
    )
    ticket = _e(item["ticket"])
    url = str(case.get("url") or "")
    # Only http(s) links are rendered as links (no javascript: URLs from a webhook body).
    case_link = (
        f'<a href="{_e(url)}">{_e(case.get("id"))}</a>'
        if url.startswith(("https://", "http://"))
        else _e(case.get("id"))
    )
    body = f"""{result_html}
<div class="cols"><div>
<section class="panel" aria-labelledby="summary-h">
<h2 id="summary-h">Case summary</h2>
<p>Internal ticket: <strong data-testid="ticket-number">{ticket}</strong>{test}</p>
<p>AGESOA case: {case_link} · {_e(case.get("domain"))} ·
{_e(case.get("category"))} · {_e(case.get("region"))}</p>
<p>{synthetic}</p>
<p>{_e(case.get("summary"))}</p>
<p>Follow-up status: <strong>{_e(STATUS_LABELS.get(item["status"], item["status"]))}</strong>
{"· Note: " + _e(item["note"]) if item.get("note") else ""}</p>
</section>
<section class="panel" aria-labelledby="causes-h"><h2 id="causes-h">Root causes</h2>{causes_html}</section>
<section class="panel" aria-labelledby="recs-h"><h2 id="recs-h">Recommendations</h2>
{_list(case.get("recommendations", []), "No recommendations listed.")}</section>
<section class="panel" aria-labelledby="val-h"><h2 id="val-h">Validations</h2>
{_list(case.get("validations", []), "No validations listed.")}</section>
</div><div>
<section class="panel" aria-labelledby="status-h">
<h2 id="status-h">Follow-up status</h2>
<form method="post" action="/tickets/{ticket}/status" data-testid="status-form">
<label for="status">Follow-up status</label>
<select id="status" name="status" required>{options}</select>
<label for="status-note">Note</label>
<textarea id="status-note" name="note" rows="3"></textarea>
<button type="submit">Send status to AGESOA</button>
</form>
</section>
<section class="panel" aria-labelledby="reply-h">
<h2 id="reply-h">Right of reply</h2>
<form method="post" action="/tickets/{ticket}/reply" data-testid="reply-form">
<label for="reply-body">Right of reply</label>
<textarea id="reply-body" name="body" rows="5" required></textarea>
<button type="submit">Send reply to AGESOA</button>
</form>
</section>
</div></div>"""
    return layout(f"Ticket {item['ticket']}", body)


def log_page(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return layout("Webhook log", "<p>No webhook requests received yet.</p>")
    rows = "".join(
        f'<tr data-testid="webhook-log-row" data-result="{_e(e["result"])}">'
        f"<td>{_e(e['received_at'])}</td><td>{_e(e['result'])}</td><td>{_e(e['reason'] or '')}</td>"
        f"<td>{_e(e['event'] or '')}</td><td>{_e(e['event_id'] or '')}</td><td>{_e(e['ticket'] or '')}</td></tr>"
        for e in entries
    )
    table = (
        "<table><caption>Webhook requests, newest first</caption><thead><tr>"
        '<th scope="col">Received at</th><th scope="col">Result</th><th scope="col">Reason</th>'
        '<th scope="col">Event</th><th scope="col">Event id</th><th scope="col">Ticket</th>'
        "</tr></thead><tbody>" + rows + "</tbody></table>"
    )
    return layout("Webhook log", table)


def settings_page(view: dict[str, Any], saved: bool = False) -> str:
    secret_state = "set" if view["webhook_secret_set"] else "not set"
    key_state = "set" if view["api_key_set"] else "not set"
    notice = '<p class="panel result ok" role="status">Settings saved.</p>' if saved else ""
    body = f"""{notice}
<p>Demo settings of a fictional system. Leave a secret field empty to keep the current value.</p>
<form method="post" action="/settings" class="panel" data-testid="settings-form">
<label for="webhook_secret">Webhook secret</label>
<input id="webhook_secret" name="webhook_secret" type="password" autocomplete="off" aria-describedby="secret-state">
<p id="secret-state">Currently {secret_state}.</p>
<label for="api_key">API key</label>
<input id="api_key" name="api_key" type="password" autocomplete="off" aria-describedby="key-state">
<p id="key-state">Currently {key_state}.</p>
<label for="agesoa_api_url">AGESOA API URL</label>
<input id="agesoa_api_url" name="agesoa_api_url" type="url" value="{_e(view["agesoa_api_url"])}">
<label for="fail_next">Fail next deliveries</label>
<input id="fail_next" name="fail_next" type="number" min="0" value="{_e(view["fail_next"])}">
<button type="submit">Save settings</button>
</form>"""
    return layout("Settings", body)

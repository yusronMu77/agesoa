"""Server-rendered HTML pages (plain HTML + inline CSS, no JavaScript). Every value is escaped."""

from html import escape
from typing import Any

TITLE = "SIM Badan Gizi Kabupaten Sukamaju (fictional)"
BAND_TEXT = "SIMULASI – organisasi fiktif"  # TXT-SIM-001

STYLE = """
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,sans-serif;color:#1d2433;background:#f6f7f9;line-height:1.5}
.sim-band{background:#7a2e0e;color:#fff;font-weight:700;text-align:center;padding:.5rem 1rem;letter-spacing:.02em}
header.app{background:#fff;border-bottom:1px solid #d8dce3;padding:.75rem 1rem}
header.app .name{font-weight:700;margin:0}
nav a{margin-right:1rem}
main{max-width:960px;margin:0 auto;padding:1rem}
a{color:#0b57a4}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{border:1px solid #d8dce3;padding:.4rem .6rem;text-align:left;vertical-align:top}
.badge{display:inline-block;border-radius:.25rem;padding:0 .4rem;font-size:.85rem;font-weight:600;border:1px solid}
.badge.alleged{background:#fff4d6;color:#6b4a00}
.badge.supported{background:#dcecff;color:#0b3d75}
.badge.proven{background:#ddf5e3;color:#145a2a}
.badge.test{background:#eee;color:#333}
.badge.synthetic{background:#f3e8ff;color:#4b1f7a}
.panel{background:#fff;border:1px solid #d8dce3;border-radius:.4rem;padding:1rem;margin:1rem 0}
label{display:block;font-weight:600;margin-top:.5rem}
input,select,textarea{font:inherit;padding:.4rem;width:100%;max-width:32rem}
button{font:inherit;margin-top:.75rem;padding:.4rem 1rem}
.result.ok{border-left:.4rem solid #1f7a3a}
.result.error{border-left:.4rem solid #a4161a}
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
</section>"""
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

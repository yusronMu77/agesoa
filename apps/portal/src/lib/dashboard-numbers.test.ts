import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import { formatDate, formatTime } from "./i18n/core";
import { activeValidators, entryNumber, heatLevel, HEAT_STEPS, newReportsByCase, rankTrending } from "./publicview";
import type { PublicCase } from "./readmodel";
import { getRecentLog, type LogEntry } from "./transparency";

function entry(seq: number, over: Partial<LogEntry> & { reason?: string } = {}): LogEntry {
  const { reason = "", ...rest } = over;
  return {
    seq,
    event_id: `e${seq}`,
    decision_id: `d${seq}`,
    source_service: "case-audit",
    action: "case.source_added",
    subject_kind: "case",
    subject_id: "K-1",
    entry: { decision: { reason } },
    prev_hash: "",
    hash: `h${seq}`,
    recorded_at: "2026-10-18T10:00:00Z",
    ...rest,
  };
}

const kase = (id: string, over: Partial<PublicCase> = {}): PublicCase => ({
  case_id: id,
  synthetic: true,
  domain: "mbg",
  category: "poisoning",
  status: "open",
  evidence_status: null,
  max_finding_status: "alleged",
  region: null,
  report_count: 1,
  signal_count: 0,
  updated_at: null,
  ...over,
});

describe("map legend steps of the design", () => {
  test("0, 1, 2–3, 4–5, 6 or more", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(heatLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
    expect(HEAT_STEPS.map((s) => [s.from, s.to])).toEqual([[0, 0], [1, 1], [2, 3], [4, 5], [6, null]]);
  });
});

describe("Sedang ramai: new reports in the last 7 days from the public log", () => {
  const added = (seq: number, id: string, kind = "report") =>
    entry(seq, { subject_id: id, reason: `Added ${kind} R-${seq} to the case: same domain, category and regency.` });

  test("counts added reports, never signals", () => {
    const counts = newReportsByCase(
      [added(1, "K-1"), added(2, "K-1"), added(3, "K-1", "signal"), added(4, "K-2")],
      [kase("K-1"), kase("K-2")],
    );
    expect(counts.get("K-1")).toBe(2);
    expect(counts.get("K-2")).toBe(1);
  });

  test("the opening source counts only when the case has no signal (it must have been a report)", () => {
    const opened = (id: string) => entry(10, { action: "case.opened", subject_id: id, reason: "Opened a new case" });
    const counts = newReportsByCase([opened("K-1"), opened("K-2")], [kase("K-1"), kase("K-2", { signal_count: 1 })]);
    expect(counts.get("K-1")).toBe(1);
    expect(counts.has("K-2")).toBe(false);
  });

  test("ignores other subjects, other actions and unpublished cases", () => {
    const counts = newReportsByCase(
      [
        added(1, "K-9"),
        entry(2, { action: "case.deadline_set", reason: "Added report" }),
        entry(3, { subject_kind: "finding", reason: "Added report x" }),
      ],
      [kase("K-1")],
    );
    expect(counts.size).toBe(0);
  });

  test("ranks by new reports, then by total reports; cases without new reports are left out", () => {
    const cases = [kase("A", { report_count: 50 }), kase("B", { report_count: 2 }), kase("C", { report_count: 9 }), kase("D")];
    const ranked = rankTrending(cases, [], new Map([["A", 1], ["B", 4], ["C", 4]]));
    expect(ranked.map((r) => [r.rank, r.case.case_id, r.newReports])).toEqual([
      [1, "C", 4],
      [2, "B", 4],
      [3, "A", 1],
    ]);
  });
});

describe("Validator aktif from the registration decisions of the public log", () => {
  test("latest decision per validator: confirmed or accepted (probation) counts", () => {
    const v = (seq: number, id: string, action: string) => ({ seq, subject_kind: "validator", subject_id: id, action });
    expect(
      activeValidators([
        v(1, "A", "validator.awaiting_confirmation"),
        v(2, "A", "validator.confirmed"),
        v(3, "B", "validator.accepted"),
        v(4, "C", "validator.confirmed"),
        v(5, "C", "validator.rejected"),
        v(6, "D", "validator.awaiting_confirmation"),
        { seq: 7, subject_kind: "case", subject_id: "E", action: "validator.confirmed" },
      ]),
    ).toBe(2);
  });
});

describe("design formats", () => {
  test("entry numbers have at least four digits", () => {
    expect(entryNumber(147)).toBe("#0147");
    expect(entryNumber(12345)).toBe("#12345");
  });

  test("time and date in WIB", () => {
    expect(formatTime("id", "2026-10-16T03:42:00Z")).toBe("10.42 WIB");
    expect(formatTime("en", "2026-10-16T03:42:00Z")).toBe("10:42 AM WIB");
    expect(formatDate("id", "2026-10-16T03:42:00Z")).toBe("16 Okt 2026");
    expect(formatDate("en", "2026-10-16T03:42:00Z")).toBe("Oct 16, 2026");
    expect(formatTime("id", null)).toBe("—");
  });
});

describe("getRecentLog", () => {
  const config = loadConfig({ SERVICE_URL_TRANSPARENCY: "http://t" });
  const log = Array.from({ length: 450 }, (_, i) =>
    entry(i + 1, { recorded_at: new Date(Date.UTC(2026, 9, 1) + i * 3600_000).toISOString() }),
  );
  const fetchImpl = async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/head")) return Response.json({ seq: log.length, hash: "h", updated_at: "" });
    const after = Number(u.searchParams.get("after") ?? 0);
    const limit = Number(u.searchParams.get("limit"));
    return Response.json({ items: log.filter((e) => e.seq > after).slice(0, limit), next_after: null });
  };

  test("reads backwards from the head until the window starts and keeps only entries inside it", async () => {
    const since = log[400].recorded_at;
    const result = await getRecentLog(config, since, 15, { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.complete).toBe(true);
    expect(result.data.items.map((e) => e.seq)).toEqual(log.slice(400).map((e) => e.seq));
  });

  test("marks the result incomplete when the page limit ends before the window", async () => {
    const result = await getRecentLog(config, "2000-01-01T00:00:00Z", 1, { fetchImpl });
    expect(result.ok && result.data.complete).toBe(false);
    expect(result.ok && result.data.items.length).toBe(200);
  });
});

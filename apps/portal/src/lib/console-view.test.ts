import { describe, expect, test } from "bun:test";
import {
  auditStepView,
  byDeadline,
  checkOrganizationForm,
  deadlineView,
  decisionChoices,
  formatClock,
  inQueueContext,
  inQueueFilter,
  isMachineActor,
  isOverdue,
  latestFirst,
  localized,
  opsTotals,
  organizationSteps,
  organizationView,
  parseConfidence,
  parseDecision,
  parseQueueFilter,
  parseReading,
  queueSummary,
  recentEvents,
  regionName,
  registrationSteps,
  registrationView,
  shortRegion,
  tokenEmail,
} from "./console-view";

describe("validator queue", () => {
  const now = new Date("2026-10-16T03:00:00Z"); // 10.00 WIB
  const items = [
    { finding_id: "F-1", my_decision: null, received_at: "2026-10-16T10:00:00Z", deadline_at: "2026-10-18T03:00:00Z" },
    { finding_id: "F-2", my_decision: "approve" as const, received_at: "2026-10-14T10:00:00Z", deadline_at: null },
    { finding_id: "F-3", received_at: "2026-10-15T08:00:00Z", state: "needs_evidence", evidence_requests: 2, deadline_at: "2026-10-15T00:00:00Z" },
    { finding_id: "F-4", my_decision: "needs_evidence" as const, received_at: "2026-10-13T08:00:00Z", state: "needs_evidence", evidence_requests: 1 },
  ];

  test("waiting = not decided by me; decided = any decision of mine, needs_evidence included", () => {
    expect(items.filter((i) => inQueueFilter(i, "waiting")).map((i) => i.finding_id)).toEqual(["F-1", "F-3"]);
    expect(items.filter((i) => inQueueFilter(i, "decided")).map((i) => i.finding_id)).toEqual(["F-2", "F-4"]);
    expect(items.filter((i) => inQueueFilter(i, "all"))).toHaveLength(4);
  });

  test("Butuh bukti chip: trust state needs_evidence, whoever asked", () => {
    expect(items.filter((i) => inQueueFilter(i, "evidence")).map((i) => i.finding_id)).toEqual(["F-3", "F-4"]);
    expect(inQueueFilter({ received_at: "x", state: "awaiting_decisions" }, "evidence")).toBe(false);
    expect(parseQueueFilter("evidence")).toBe("evidence");
  });

  test("nearest deadline first, no deadline last, oldest first among equals; input unchanged", () => {
    expect(byDeadline(items).map((i) => i.finding_id)).toEqual(["F-3", "F-1", "F-4", "F-2"]);
    expect(items[0].finding_id).toBe("F-1");
  });

  test("overdue is client side against now; no deadline is never overdue", () => {
    expect(isOverdue(items[2], now)).toBe(true);
    expect(isOverdue(items[0], now)).toBe(false);
    expect(isOverdue(items[1], now)).toBe(false);
    expect(isOverdue({ deadline_at: "nope" }, now)).toBe(false);
  });

  test("relative deadline in WIB calendar days", () => {
    expect(deadlineView(null, now)).toEqual({ kind: "none" });
    expect(deadlineView("2026-10-16T02:59:00Z", now)).toEqual({ kind: "overdue" });
    expect(deadlineView("2026-10-16T16:59:00Z", now)).toEqual({ kind: "today" }); // 23.59 WIB
    expect(deadlineView("2026-10-16T17:00:00Z", now)).toEqual({ kind: "tomorrow" }); // 00.00 WIB next day
    expect(deadlineView("2026-10-18T03:00:00Z", now)).toEqual({ kind: "days", days: 2 });
  });

  test("topbar context: issue type and region, empty means all", () => {
    const row = { domain: "mbg", region: { regency_name: "Kab. A", district_name: "Kec. B" } };
    expect(inQueueContext(row, { domain: "", region: "" })).toBe(true);
    expect(inQueueContext(row, { domain: "mbg", region: "Kec. B, Kab. A" })).toBe(true);
    expect(inQueueContext(row, { domain: "roads", region: "" })).toBe(false);
    expect(inQueueContext(row, { domain: "", region: "Kab. C" })).toBe(false);
  });

  test("summary: waiting with overdue, evidence requests, my decisions, nearest waiting deadline", () => {
    expect(queueSummary(items, now)).toEqual({
      waiting: 2,
      overdue: 1,
      evidence: 2,
      evidenceRequests: 3,
      decided: 2,
      approved: 1,
      rejected: 0,
      total: 4,
      nearest: { finding_id: "F-3", deadline_at: "2026-10-15T00:00:00Z", region: undefined },
    });
    expect(queueSummary([], now)).toEqual({
      waiting: 0,
      overdue: 0,
      evidence: 0,
      evidenceRequests: 0,
      decided: 0,
      approved: 0,
      rejected: 0,
      total: 0,
      nearest: null,
    });
  });

  test("unknown filter falls back to waiting", () => {
    expect(parseQueueFilter("decided")).toBe("decided");
    expect(parseQueueFilter("nope")).toBe("waiting");
    expect(parseQueueFilter(undefined)).toBe("waiting");
  });

  test("region name from the untyped trust answer", () => {
    expect(regionName({ region: { regency_name: "Kab. A", district_name: "Kec. B" } })).toBe("Kec. B, Kab. A");
    expect(regionName({ region: { regency_name: "Kab. A", district_name: null } })).toBe("Kab. A");
    expect(regionName({ region: null })).toBeNull();
    expect(regionName({})).toBeNull();
  });

  test("short region: district first, then regency", () => {
    expect(shortRegion({ region: { regency_name: "Kab. A", district_name: "Kec. B" } })).toBe("Kec. B");
    expect(shortRegion({ region: { regency_name: "Kab. A", district_name: null } })).toBe("Kab. A");
    expect(shortRegion({ region: null })).toBeNull();
  });
});

describe("audit steps", () => {
  test("localized picks the language, then Indonesian, then English", () => {
    expect(localized({ en: "Process", id: "Proses" }, "en")).toBe("Process");
    expect(localized({ en: "Process", id: "Proses" }, "id")).toBe("Proses");
    expect(localized({ en: "Only English" }, "id")).toBe("Only English");
    expect(localized("plain", "en")).toBe("plain");
    expect(localized(3, "en")).toBeNull();
  });

  test("step view: title + short scalar facts, nested data skipped", () => {
    const view = auditStepView(
      {
        rank: 1,
        label: { en: "Process (temperature, delay)", id: "Proses (suhu, jeda)" },
        score: 0.3,
        method: "lexical",
        against: [],
        violated_rules: ["consume_within_4h"],
        nested: { a: 1 },
        question_id: "Q-1",
      },
      "id",
    );
    expect(view.title).toBe("Proses (suhu, jeda)");
    expect(view.facts).toEqual([
      { key: "rank", value: "1" },
      { key: "score", value: "0.30" },
      { key: "method", value: "lexical" },
      { key: "violated_rules", value: "consume_within_4h" },
    ]);
  });

  test("machine actors are AI results, people are not", () => {
    expect(isMachineActor("hypothesis_ranking")).toBe(true);
    expect(isMachineActor("interview_planner")).toBe(true);
    expect(isMachineActor("validator:VAL-DEMO-1")).toBe(false);
  });
});

describe("steps", () => {
  test("validator registration follows the profile status", () => {
    expect(registrationSteps(null)).toEqual(["current", "current", "next", "next"]);
    expect(registrationSteps("awaiting_confirmation")).toEqual(["done", "done", "done", "current"]);
    expect(registrationSteps("rejected")).toEqual(["done", "done", "done", "current"]);
  });

  test("organization: DNS is current until verified or rejected", () => {
    expect(organizationSteps("awaiting_dns")).toEqual(["done", "current", "next"]);
    expect(organizationSteps("verified")).toEqual(["done", "done", "current"]);
  });
});

describe("operator", () => {
  const a = {
    outbox_published: 3,
    outbox_pending: 1,
    outbox_failing: 0,
    inbox_processed: 5,
    recent: [{ direction: "out" as const, event_type: "x", at: "2026-10-16T10:00:00Z", status: "published" }],
  };
  const b = {
    outbox_published: 2,
    outbox_pending: 0,
    outbox_failing: 1,
    inbox_processed: 4,
    recent: [{ direction: "in" as const, event_type: "y", at: "2026-10-16T11:00:00Z", status: "processed" }],
  };

  test("totals over the services that answered", () => {
    expect(opsTotals([a, null, b])).toEqual({ reporting: 2, published: 5, pending: 1, failing: 1, processed: 9 });
  });

  test("recent events of all services, newest first", () => {
    const events = recentEvents([
      { service: "trust", data: a },
      { service: "delivery", data: b },
      { service: "ingestion", data: null },
    ]);
    expect(events.map((e) => `${e.service}:${e.event_type}`)).toEqual(["delivery:y", "trust:x"]);
    expect(recentEvents([{ service: "trust", data: a }], 0)).toEqual([]);
  });
});

describe("registration flow", () => {
  test("form for a new candidate or a corrected rejection, documents step on request", () => {
    expect(registrationView({ status: null, step: "", retry: false, hasReading: false })).toEqual({ kind: "form", step: 0 });
    expect(registrationView({ status: null, step: "documents", retry: false, hasReading: false })).toEqual({ kind: "form", step: 1 });
    expect(registrationView({ status: "rejected", step: "", retry: true, hasReading: false })).toEqual({ kind: "form", step: 0 });
    expect(registrationView({ status: "rejected", step: "", retry: false, hasReading: false })).toEqual({ kind: "status" });
  });

  test("review only right after the reading, otherwise the status", () => {
    expect(registrationView({ status: "awaiting_confirmation", step: "review", retry: false, hasReading: true })).toEqual({ kind: "review" });
    expect(registrationView({ status: "awaiting_confirmation", step: "review", retry: false, hasReading: false })).toEqual({ kind: "status" });
    expect(registrationView({ status: "probation", step: "", retry: false, hasReading: true })).toEqual({ kind: "status" });
  });

  test("reading cookie: fields kept, confidence clamped, junk rejected", () => {
    expect(parseReading('{"issuer":"Redaksi","number":"","valid_until":"2027-10-17","confidence":0.82,"name":"X"}')).toEqual({
      issuer: "Redaksi",
      number: null,
      valid_until: "2027-10-17",
      confidence: 0.82,
    });
    expect(parseReading('{"confidence":3}')?.confidence).toBe(1);
    expect(parseReading('{"issuer":"x"}')).toBeNull();
    expect(parseReading("not json")).toBeNull();
    expect(parseReading(undefined)).toBeNull();
  });
});

describe("organization page", () => {
  test("TXT step until a check says something, status after it, dashboard once verified", () => {
    expect(organizationView("awaiting_dns", null)).toBe("dns");
    expect(organizationView("awaiting_dns", "dns_error")).toBe("dns");
    expect(organizationView("awaiting_dns", "no_record")).toBe("status");
    expect(organizationView("awaiting_dns", "token_mismatch")).toBe("status");
    expect(organizationView("verified", "verified")).toBe("status");
    expect(organizationView("verified", "already_verified")).toBe("status");
    expect(organizationView("verified", null)).toBe("dashboard");
    expect(organizationView("rejected", null)).toBe("status");
  });

  test("latest deliveries first, limited", () => {
    const rows = [{ created_at: "2026-10-15T10:00:00Z" }, { created_at: "2026-10-17T10:00:00Z" }, { created_at: "2026-10-16T10:00:00Z" }];
    expect(latestFirst(rows, 2).map((r) => r.created_at)).toEqual(["2026-10-17T10:00:00Z", "2026-10-16T10:00:00Z"]);
    expect(latestFirst(rows)).toHaveLength(3);
    expect(rows[0].created_at).toBe("2026-10-15T10:00:00Z");
  });
});

describe("clock time", () => {
  test("Western Indonesia Time, design separators, optional seconds", () => {
    expect(formatClock("id", "2026-10-16T03:42:07Z")).toBe("10.42 WIB");
    expect(formatClock("id", "2026-10-16T03:42:07Z", true)).toBe("10.42.07 WIB");
    expect(formatClock("en", "2026-10-16T03:42:07Z")).toBe("10:42 AM WIB");
    expect(formatClock("en", "2026-10-16T03:42:07Z", true)).toBe("10:42:07 AM WIB");
    expect(formatClock("id", "nope")).toBe("nope");
    expect(formatClock("id", null)).toBe("—");
  });
});

describe("decision (SCR-020)", () => {
  test("three choices before deciding, approve/reject once after asking for evidence, none when final", () => {
    expect(decisionChoices(null, false)).toEqual(["approve", "reject", "needs_evidence"]);
    expect(decisionChoices("needs_evidence", false)).toEqual(["approve", "reject"]);
    expect(decisionChoices("approve", false)).toEqual([]);
    expect(decisionChoices("reject", false)).toEqual([]);
    expect(decisionChoices(null, true)).toEqual([]);
  });

  test("posted values: unknown decisions refused, confidence levels mapped", () => {
    expect(parseDecision("needs_evidence")).toBe("needs_evidence");
    expect(parseDecision("maybe")).toBeNull();
    expect(parseDecision(null)).toBeNull();
    expect(parseConfidence("high")).toBe(0.9);
    expect(parseConfidence("medium")).toBe(0.7);
    expect(parseConfidence("low")).toBe(0.5);
    expect(parseConfidence("")).toBeNull();
    expect(parseConfidence("0.9")).toBeNull();
  });

  test("admin e-mail from the session token, display only", () => {
    const token = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
    expect(tokenEmail(token({ email: "admin@redaksi.example" }))).toBe("admin@redaksi.example");
    expect(tokenEmail(token({ sub: "x" }))).toBeNull();
    expect(tokenEmail("garbage")).toBeNull();
    expect(tokenEmail(null)).toBeNull();
  });
});

describe("organization form (SCR-060)", () => {
  const form = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };
  const valid = { name: "Badan Layanan", kind: "agency", domain: "layanan.example", regency: "Kab. A", authority: "on" };

  test("valid form, contact e-mail optional and trimmed", () => {
    const ok = checkOrganizationForm(form({ ...valid, contact_email: "  kontak@layanan.example " }));
    expect(ok).toEqual({
      ok: true,
      values: { name: "Badan Layanan", kind: "agency", domain: "layanan.example", regency: "Kab. A", contact_email: "kontak@layanan.example", authority: true },
    });
    expect(checkOrganizationForm(form(valid)).ok).toBe(true);
  });

  test("a URL instead of a domain, a bad e-mail and a missing declaration are field errors; entries kept", () => {
    const bad = checkOrganizationForm(form({ ...valid, domain: "https://layanan.example/", contact_email: "nope", authority: "" }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toEqual({ domain: "org.domainHint", contact_email: "org.error.email", authority: "org.error.authority" });
    expect(bad.values.domain).toBe("https://layanan.example/");
    expect(checkOrganizationForm(form({ ...valid, domain: "layanan.example/path" })).ok).toBe(false);
  });
});

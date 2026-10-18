import { describe, expect, test } from "bun:test";
import {
  auditStepView,
  inQueueFilter,
  isMachineActor,
  localized,
  opsTotals,
  organizationSteps,
  parseQueueFilter,
  queueSummary,
  recentEvents,
  regionName,
  registrationSteps,
} from "./console-view";

describe("validator queue", () => {
  const items = [
    { my_decision: null, received_at: "2026-10-16T10:00:00Z" },
    { my_decision: "approve" as const, received_at: "2026-10-14T10:00:00Z" },
    { received_at: "2026-10-15T08:00:00Z" },
  ];

  test("filters by my own decision; unknown counts as waiting", () => {
    expect(items.filter((i) => inQueueFilter(i, "waiting"))).toHaveLength(2);
    expect(items.filter((i) => inQueueFilter(i, "decided"))).toHaveLength(1);
    expect(items.filter((i) => inQueueFilter(i, "all"))).toHaveLength(3);
  });

  test("summary counts and the oldest waiting item", () => {
    expect(queueSummary(items)).toEqual({ waiting: 2, decided: 1, total: 3, oldestWaiting: "2026-10-15T08:00:00Z" });
    expect(queueSummary([])).toEqual({ waiting: 0, decided: 0, total: 0, oldestWaiting: null });
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

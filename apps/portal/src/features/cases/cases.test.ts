import { describe, expect, test } from "bun:test";
import type { LogEntry } from "@/services/transparency/transparency.model";
import { evidenceCountText, FOLLOW_UP_STATUS_LABEL } from "./constants";
import { decisionOf, mergeEntries } from "./lib/case-log";

const entry = (seq: number, value: unknown = null) => ({ seq, entry: value }) as LogEntry;

describe("case decision log", () => {
  test("merges subject queries in order without duplicates", () => {
    expect(mergeEntries([[entry(3), entry(1)], [entry(1), entry(2)]]).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  test("reads the decision of an entry", () => {
    expect(decisionOf(entry(1, { decision: { reason: "pattern" } })).reason).toBe("pattern");
    expect(decisionOf(entry(1, null))).toEqual({});
  });
});

describe("follow-up and audit report (SCR-041, SCR-043)", () => {
  test("labels follow-up statuses", () => {
    expect(FOLLOW_UP_STATUS_LABEL).toEqual({ received: "Received", in_progress: "In progress", done: "Done" });
  });

  test("says how many evidence items back a root cause", () => {
    expect(evidenceCountText(0)).toBe("No evidence item yet: reported or inferred only");
    expect(evidenceCountText(1)).toBe("Based on 1 evidence item");
    expect(evidenceCountText(3)).toBe("Based on 3 evidence items");
  });
});

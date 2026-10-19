import { describe, expect, test } from "bun:test";
import { DELIVERY_STATUS_LABEL, isDnsResult } from "./constants";
import { attemptsSummary } from "./lib/attempts";

describe("agency dashboard formatting", () => {
  test("summarises attempts in order, with the error when there was no HTTP answer", () => {
    expect(
      attemptsSummary([
        { attempt: 3, http_status: 200, error: null, attempted_at: "" },
        { attempt: 1, http_status: 500, error: null, attempted_at: "" },
        { attempt: 2, http_status: 503, error: null, attempted_at: "" },
      ]),
    ).toBe("1: 500, 2: 503, 3: 200");
    expect(attemptsSummary([{ attempt: 1, http_status: null, error: "timeout", attempted_at: "" }])).toBe("1: timeout");
    expect(attemptsSummary([])).toBe("—");
  });

  test("labels delivery statuses", () => {
    expect(DELIVERY_STATUS_LABEL).toEqual({ pending: "Pending", delivered: "Delivered", failed: "Failed" });
  });

  test("accepts only known DNS results from the URL", () => {
    expect(isDnsResult("no_record")).toBe(true);
    expect(isDnsResult("toString")).toBe(false);
    expect(isDnsResult("<script>")).toBe(false);
    expect(isDnsResult(undefined)).toBe(false);
  });
});

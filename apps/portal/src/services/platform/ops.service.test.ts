import { describe, expect, test } from "bun:test";
import { loadConfig } from "@/configs/env.config";
import { resetDemo } from "./ops.service";

const config = loadConfig({});

describe("demo reset by an operator", () => {
  test("resets the four services first, transparency last, then rebuilds the read model", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ tables: ["a", "b"] }), { status: 200 });
    };
    let t = 0;
    const report = await resetDemo(config, "tok", { fetchImpl, now: () => (t += 1500) });
    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => s.service)).toEqual(["ingestion", "case-audit", "trust", "delivery", "transparency", "read model"]);
    expect(calls.at(-2)).toEndWith(":8005/v1/ops/demo-reset");
    expect(calls.at(-1)).toEndWith(":8005/v1/ops/read-model/rebuild");
    expect(report.seconds).toBe(1.5);
  });

  test("stops before the log is restarted when another service fails", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response("{}", { status: url.includes(":8003") ? 403 : 200 });
    };
    const report = await resetDemo(config, "tok", { fetchImpl });
    expect(report.ok).toBe(false);
    expect(calls.some((u) => u.includes(":8005"))).toBe(false);
  });
});

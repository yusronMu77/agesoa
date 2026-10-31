import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import type { FetchLike } from "./http";
import { ASK_TIMEOUT_MS, askQuestion, parseQuestion } from "./questions";
import { canonicalPath, ROUTES, surfaceOf } from "./routes";

describe("public questions", () => {
  test("the question from ?q= is trimmed, whitespace collapsed, and only 3–300 characters count", () => {
    expect(parseQuestion("  kenapa   siswa\nkeracunan? ")).toBe("kenapa siswa keracunan?");
    expect(parseQuestion(["water tank", "ignored"])).toBe("water tank");
    for (const bad of [undefined, "", "  ", "ab", "x".repeat(301)]) expect(parseQuestion(bad)).toBeNull();
    expect(parseQuestion("x".repeat(300))).toHaveLength(300);
  });

  test("asks the transparency service with a POST and the reader's language, and waits for a model answer", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      calls.push({ url, init });
      const body = { answer: "One kitchen serves 34 schools.", references: [], method: "extractive" };
      return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
    };
    const config = loadConfig({ SERVICE_URL_TRANSPARENCY: "http://transparency.test" });

    const result = await askQuestion(config, "water tank", "en", { fetchImpl });

    expect(result.ok && result.data.method).toBe("extractive");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://transparency.test/v1/questions");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ question: "water tank", lang: "en" });
    expect(ASK_TIMEOUT_MS).toBeGreaterThan(20_000); // the service falls back after 20 s: the portal waits longer
  });

  test("the answer page is a public English route", () => {
    expect(ROUTES.ask).toBe("/ask");
    expect(surfaceOf(`${ROUTES.ask}?q=water`)).toBe("public");
    expect(canonicalPath(ROUTES.ask)).toBe("/ask");
  });
});

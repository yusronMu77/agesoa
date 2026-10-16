import { describe, expect, test } from "bun:test";
import { ApiError, CaseAuditClient, errorDetail, IngestionClient } from "./api";
import type { KeyValueStore } from "./auth";
import { bearerToken, deviceId } from "./auth";
import { ConfigError, loadConfig } from "./config";
import { T, t } from "./copy";
import {
  canonicalWord,
  fieldInError,
  formatWib,
  fromInput,
  fromLocalInput,
  isPostLink,
  toInput,
  toLocalInput,
} from "./fields";

const SYMPTOMS = { nausea: ["mual"], vomiting: ["muntah"], diarrhea: ["diare", "mencret"] };

function memory(): KeyValueStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v) };
}

describe("config", () => {
  test("defaults to a local run against the local ingestion service", () => {
    expect(loadConfig({})).toEqual({
      appEnv: "local",
      demoMode: false,
      ingestionUrl: "http://localhost:8001",
      caseAuditUrl: "http://localhost:8002",
      domain: "mbg",
    });
  });

  test("demo mode is refused in prod", () => {
    expect(() => loadConfig({ VITE_APP_ENV: "prod", VITE_DEMO_MODE: "true" })).toThrow(ConfigError);
  });

  test("bad values fail loudly", () => {
    expect(() => loadConfig({ VITE_APP_ENV: "qa" })).toThrow(/VITE_APP_ENV/);
    expect(() => loadConfig({ VITE_DEMO_MODE: "maybe" })).toThrow(/VITE_DEMO_MODE/);
    expect(() => loadConfig({ VITE_INGESTION_URL: "ftp://x" })).toThrow(/http or https/);
  });

  test("trailing slashes are dropped", () => {
    expect(loadConfig({ VITE_INGESTION_URL: "https://ingest.example.id/" }).ingestionUrl).toBe(
      "https://ingest.example.id",
    );
  });
});

describe("anonymous reporter", () => {
  test("one random id per device, nothing identifying", () => {
    const store = memory();
    const id = deviceId(store);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId(store)).toBe(id);
    expect(bearerToken("local", store)).toBe(`dev:${id}`);
  });

  test("a tampered id is replaced", () => {
    const store = memory();
    store.setItem("agesoa.witness.device", "budi@example.com");
    expect(deviceId(store)).not.toContain("@");
  });

  test("deployed environments wait for Firebase anonymous sign-in", () => {
    expect(() => bearerToken("demo", memory())).toThrow(/#23/);
  });
});

describe("field values", () => {
  test("datetimes are shown and typed in WIB", () => {
    expect(toLocalInput("2026-10-05T03:00:00+07:00")).toBe("2026-10-05T03:00");
    expect(toLocalInput("2026-10-04T20:00:00Z")).toBe("2026-10-05T03:00");
    expect(fromLocalInput("2026-10-05T09:30")).toBe("2026-10-05T09:30:00+07:00");
    expect(fromLocalInput("09:30")).toBeNull();
    expect(formatWib("2026-10-07T03:00:00+07:00")).toBe("Rab, 7 Okt 2026 03.00 WIB");
  });

  test("list values use the pack's local words and map back to canonical ids", () => {
    expect(toInput("string_list", ["nausea", "vomiting"], SYMPTOMS)).toBe("mual, muntah");
    expect(fromInput("string_list", "mual, Mencret, gatal, mual", SYMPTOMS)).toEqual(["nausea", "diarrhea", "gatal"]);
    expect(canonicalWord("muntah", undefined)).toBe("muntah");
  });

  test("empty input removes a value; invalid input reaches the service validation", () => {
    expect(fromInput("integer", " ", undefined)).toBeNull();
    expect(fromInput("integer", "33", undefined)).toBe(33);
    expect(fromInput("integer", "banyak", undefined)).toBe("banyak");
    expect(fromInput("datetime", "2026-10-05T03:00", undefined)).toBe("2026-10-05T03:00:00+07:00");
  });

  test("the field named in a validation message is found", () => {
    const ids = ["affected_count", "school"];
    expect(fieldInError("fields: affected_count: expected a whole number", ids)).toBe("affected_count");
    expect(fieldInError("fields: unknown field 'verdict'", ids)).toBeNull();
    expect(fieldInError("choose a category first", ids)).toBeNull();
  });

  test("post links", () => {
    expect(isPostLink("https://x.com/someone/status/1844")).toBe(true);
    expect(isPostLink("bukan link")).toBe(false);
    expect(isPostLink("javascript:alert(1)")).toBe(false);
    expect(isPostLink("https://localhost/x")).toBe(false);
  });
});

describe("copy", () => {
  test("placeholders are filled", () => {
    expect(t("TXT-WIT-020", { detik: 3 })).toBe("Rekaman suara (3 detik)");
    expect(t("TXT-WIT-114", { tenggat: "Rab, 7 Okt 2026 03.00 WIB" })).toBe(
      "Amankan bukti sebelum Rab, 7 Okt 2026 03.00 WIB",
    );
  });

  test("no screen asks for identity", () => {
    const asks = Object.values(T).filter((text) => /\b(nama lengkap|nomor hp|email|login|masuk|daftar)\b/i.test(text));
    expect(asks).toEqual([T["TXT-WIT-003"]]); // the only mention says we do NOT ask
  });
});

describe("ingestion client", () => {
  const config = loadConfig({});

  test("sends the anonymous token and JSON", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const client = new IngestionClient(config, async (url, init) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ district_code: "99.01.01" }), { status: 200 });
    });
    await client.resolveDistrict(-6.92, 106.93);
    expect(seen?.url).toBe("http://localhost:8001/v1/regions/resolve");
    const headers = seen?.init?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer dev:/);
    expect(JSON.parse(String(seen?.init?.body))).toEqual({ lat: -6.92, lon: 106.93 });
  });

  test("errors carry the status and the service message", async () => {
    const client = new IngestionClient(config, async () =>
      Response.json({ detail: "shared_post.url: not a link" }, { status: 422 }),
    );
    const error = await client.createReport({ domain: "mbg" }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.detail).toBe("shared_post.url: not a link");
  });

  test("unreachable service", async () => {
    const client = new IngestionClient(config, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await client.districts().catch((e) => e)).status).toBeNull();
  });

  test("FastAPI validation errors are readable", () => {
    expect(errorDetail({ detail: [{ loc: ["body", "location", "lat"], msg: "too large" }] })).toBe(
      "location.lat: too large",
    );
  });
});

describe("case-audit client (SCR-006)", () => {
  const config = loadConfig({});

  test("reads the questions with the anonymous token and posts one answer", async () => {
    const seen: { url: string; method?: string; body?: unknown; auth?: string }[] = [];
    const client = new CaseAuditClient(config, async (url, init) => {
      seen.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        auth: (init?.headers as Record<string, string>).authorization,
      });
      return Response.json(init?.method === "POST" ? {} : [], { status: 200 });
    });
    await client.questions();
    await client.answer("C-1", "Q-1", "Makanan disajikan dingin");
    expect(seen[0].url).toBe("http://localhost:8002/v1/witness/questions");
    expect(seen[0].auth).toMatch(/^Bearer dev:/);
    expect(seen[1]).toMatchObject({
      url: "http://localhost:8002/v1/cases/C-1/witness-answers",
      method: "POST",
      body: { question_id: "Q-1", answer: "Makanan disajikan dingin" },
    });
  });

  test("an answered question is a 409 the screen can show", async () => {
    const client = new CaseAuditClient(config, async () => Response.json({ detail: "already answered" }, { status: 409 }));
    const error: unknown = await client.answer("C-1", "Q-1", "x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });

  test("the case-audit URL is configurable", () => {
    expect(loadConfig({ VITE_CASE_AUDIT_URL: "https://audit.example.id/" }).caseAuditUrl).toBe(
      "https://audit.example.id",
    );
  });
});

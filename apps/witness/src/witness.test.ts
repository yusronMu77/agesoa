import { describe, expect, mock, test } from "bun:test";
import { ApiError, CaseAuditClient, errorDetail, IngestionClient } from "./api";
import type { KeyValueStore } from "./auth";
import { authToken, bearerToken, deviceId } from "./auth";
import { messageFor, orderPacks } from "./App";
import { ConfigError, loadConfig } from "./config";
import { ID, LANGUAGES, language, pick, setLanguage, T, t } from "./copy";
import { EN } from "./copy.en";
import {
  EmptyRecording,
  LocationUnavailable,
  locationError,
  nativeLocationCode,
  PermissionDenied,
  recordingResult,
} from "./device";
import { appendDictated, dictationSupported, startDictation } from "./dictation";
import { errorText } from "./errors";
import { fieldsFromQuery, parseShare, receive } from "./share";
import {
  LANGUAGE_CATALOG,
  LANGUAGE_KEY,
  REGION_KEY,
  saveLanguage,
  savedLanguage,
  savedPreference,
  savedRegion,
  saveRegion,
  searchLanguages,
  suggestedLanguage,
} from "./language";
import { LAST_REPORT_KEY, lastReportId, MAX_REPORTS, rememberReport, reportCodeOf, reportIds, REPORTS_KEY } from "./reports";
import { evidenceRow, splitFirstSentence } from "./screens/DraftReview";
import { questionsReport, reportTitle } from "./screens/MyReports";
import {
  canonicalWord,
  fieldInError,
  formatDay,
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
      domain: "general",
      firebase: null,
    });
  });

  test("deployed environments need the Firebase settings; the auth domain defaults from the project", () => {
    expect(() => loadConfig({ VITE_APP_ENV: "demo" })).toThrow(/VITE_FIREBASE_API_KEY/);
    expect(
      loadConfig({ VITE_APP_ENV: "demo", VITE_FIREBASE_API_KEY: "k", VITE_FIREBASE_PROJECT_ID: "agesoa-demo" }).firebase,
    ).toEqual({ apiKey: "k", projectId: "agesoa-demo", authDomain: "agesoa-demo.firebaseapp.com" });
  });

  test("reports start on the general pack; the legacy VITE_DOMAIN is ignored", () => {
    expect(loadConfig({}).domain).toBe("general");
    expect(loadConfig({ VITE_DOMAIN: "mbg" }).domain).toBe("general");
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

  test("the development token is refused outside local", () => {
    expect(() => bearerToken("demo", memory())).toThrow(/only accepted in local/);
  });

  test("deployed environments send the Firebase anonymous ID token; local keeps the dev token", async () => {
    const firebase = { apiKey: "k", projectId: "agesoa-demo", authDomain: "agesoa-demo.firebaseapp.com" };
    const demo = { ...loadConfig({}), appEnv: "demo" as const, firebase };
    const seen: unknown[] = [];
    const idToken = async (config: unknown) => (seen.push(config), "id-token");
    expect(await authToken(demo, memory(), idToken)).toBe("id-token");
    expect(seen).toEqual([firebase]);
    expect(await authToken(loadConfig({}), memory(), idToken)).toMatch(/^dev:/);
    expect(authToken({ ...demo, firebase: null }, memory(), idToken)).rejects.toThrow(/Firebase settings/);
  });
});

describe("field values", () => {
  test("datetimes are shown and typed in WIB", () => {
    expect(toLocalInput("2026-10-05T03:00:00+07:00")).toBe("2026-10-05T03:00");
    expect(toLocalInput("2026-10-04T20:00:00Z")).toBe("2026-10-05T03:00");
    expect(fromLocalInput("2026-10-05T09:30")).toBe("2026-10-05T09:30:00+07:00");
    expect(fromLocalInput("09:30")).toBeNull();
    // Locale formats of agesoa-uiux DESIGN-BRIEF: "16 Okt 2026, 10.42 WIB" / "Oct 16, 2026, 10:42 AM WIB".
    expect(formatWib("2026-10-16T03:42:00Z")).toBe("16 Okt 2026, 10.42 WIB");
    expect(formatWib("2026-10-16T03:42:00Z", "en")).toBe("Oct 16, 2026, 10:42 AM WIB");
    expect(formatWib("2026-10-07T15:05:00+07:00", "en")).toBe("Oct 7, 2026, 3:05 PM WIB");
    // Deadlines carry the day name (SCR-005 mockup).
    expect(formatWib("2026-10-17T10:30:00+07:00", "id", { weekday: true })).toBe("Sabtu, 17 Okt 2026, 10.30 WIB");
    expect(formatWib("2026-10-17T10:30:00+07:00", "en", { weekday: true })).toBe("Saturday, Oct 17, 2026, 10:30 AM WIB");
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
    expect(t("TXT-WIT-114", { tenggat: "Sabtu, 17 Okt 2026, 10.30 WIB" })).toBe(
      "Amankan bukti sebelum Sabtu, 17 Okt 2026, 10.30 WIB",
    );
    expect(t("TXT-WIT-162", { n: 1 })).toBe("1 pertanyaan menunggu");
  });

  test("microcopy ids keep the design text (agesoa-uiux copy/microcopy.md, mockups of 18 Oct 2026)", () => {
    const expected: Partial<Record<keyof typeof ID, string>> = {
      "TXT-WIT-170": "Bahasa dan wilayah",
      "TXT-WIT-188": "Cerita kejadian",
      "TXT-WIT-189": "Lengkapi draf sesuai kejadian yang Anda ketahui.",
      "TXT-WIT-191": "Formulir laporan belum bisa dimuat. Coba lagi.",
      "TXT-WIT-192": "Coba lagi",
      "TXT-WIT-193": "Perlu dilengkapi untuk audit",
      "TXT-WIT-194": "Informasi tambahan (opsional)",
      "TXT-WIT-196": "Belum ada kolom tambahan.",
      "TXT-WIT-197": "Kolom tambahan {nomor}",
      "TXT-WIT-198": "Nama kolom",
      "TXT-WIT-199": "Contoh: Kondisi sekitar",
      "TXT-WIT-200": "Isi",
      "TXT-WIT-201": "Tulis informasi yang Anda ketahui",
      "TXT-WIT-202": "Hapus kolom tambahan {nomor}",
      "TXT-WIT-203": "Lengkapi nama dan isi kolom tambahan, atau hapus kolom yang tidak dipakai.",
      "TXT-WIT-204": "Nama kolom tambahan sudah dipakai. Gunakan nama yang berbeda.",
      "TXT-WIT-205": "Tambah kolom",
      "TXT-WIT-206": "Hapus kolom",
      "TXT-WIT-207": "kolom tambahan",
      "TXT-WIT-208": "Cari bahasa",
      "TXT-WIT-209": "Bahasa pilihan",
      "TXT-WIT-211": "Sesuai bahasa perangkat",
      "TXT-WIT-212": "Terjemahan belum tersedia",
      "TXT-WIT-213": "Bahasa tidak ditemukan. Coba nama atau kode lain.",
      "TXT-WIT-214": "Simpan", // mockup SCR-009 (the table says "Simpan pengaturan")
    };
    for (const [id, text] of Object.entries(expected)) expect(ID[id as keyof typeof ID] as string).toBe(text);
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

describe("device errors (#106, #107)", () => {
  test("native geolocation plugin errors map to the same codes", () => {
    expect(nativeLocationCode(new Error("Location permission was denied"))).toBe(1);
    expect(nativeLocationCode({ message: "Timeout expired" })).toBe(3);
    expect(nativeLocationCode(new Error("Location unavailable"))).toBe(2);
  });

  test("geolocation codes: 1 is a refusal, 2 and 3 let the reporter pick a district", () => {
    expect(locationError({ code: 1 })).toBeInstanceOf(PermissionDenied);
    const unavailable = locationError({ code: 2 });
    const timeout = locationError({ code: 3 });
    expect(unavailable).toBeInstanceOf(LocationUnavailable);
    expect((unavailable as LocationUnavailable).reason).toBe("unavailable");
    expect((timeout as LocationUnavailable).reason).toBe("timeout");
  });

  test("a raw non-Error value is never shown as text", () => {
    const raw = { code: 2, message: "" }; // what a GeolocationPositionError looks like to String()
    expect(errorText(raw)).toBe(T["TXT-WIT-133"]);
    expect(errorText(new ApiError(null, "down"))).toBe(T["TXT-WIT-130"]);
    expect(errorText(new Error("specific"))).toBe("specific");
  });

  test("screen-level messages fall back to the app text for a non-Error value", () => {
    expect(messageFor({ code: 3, message: "" })).toBe(T["TXT-WIT-133"]);
    expect(messageFor("boom")).toBe(T["TXT-WIT-133"]);
    expect(messageFor(new ApiError(null, "down"))).toBe(T["TXT-WIT-130"]);
    expect(messageFor(new ApiError(413, "too large"))).toBe(T["TXT-WIT-132"]);
    expect(messageFor(new Error("specific"))).toBe("specific");
  });

  test("a recording without data is refused; the duration comes from the data", () => {
    expect(() => recordingResult([], "audio/webm", 4000)).toThrow(EmptyRecording);
    expect(() => recordingResult([new Blob([])], "audio/webm", 4000)).toThrow(EmptyRecording);
    const { blob, seconds } = recordingResult([new Blob([new Uint8Array(512)])], "audio/webm", 2600);
    expect(blob.size).toBe(512);
    expect(seconds).toBe(3);
    // data that arrived within the first half second still counts as one second, never "0 detik"
    expect(recordingResult([new Blob([new Uint8Array(8)])], "audio/webm", 120).seconds).toBe(1);
  });

  test("copy for the new messages exists", () => {
    for (const id of ["TXT-WIT-033", "TXT-WIT-034", "TXT-WIT-036", "TXT-WIT-037", "TXT-WIT-133"] as const) {
      expect(T[id].length).toBeGreaterThan(10);
    }
  });
});

describe("SCR-006 voice answers by dictation + report status (#49)", () => {
  class FakeRecognition {
    static last: FakeRecognition;
    lang = "";
    interimResults = true;
    continuous = false;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    started = false;
    constructor() {
      FakeRecognition.last = this;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.onend?.();
    }
  }

  test("not offered without speech recognition", () => {
    expect(dictationSupported({})).toBe(false);
    expect(startDictation(() => undefined, () => undefined, {})).toBeNull();
    expect(dictationSupported({ webkitSpeechRecognition: FakeRecognition })).toBe(true);
  });

  test("final phrases in Indonesian go to the answer; interim ones do not", () => {
    const phrases: string[] = [];
    let ended: string | undefined = "not yet";
    const dictation = startDictation(
      (text) => phrases.push(text),
      (error) => {
        ended = error;
      },
      { SpeechRecognition: FakeRecognition },
    );
    const r = FakeRecognition.last;
    expect(r.started && r.lang === "id-ID" && !r.interimResults).toBe(true);
    r.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: "nasi" } },
        { isFinal: true, 0: { transcript: " nasinya basi " } },
      ],
    });
    dictation?.stop();
    expect(phrases).toEqual(["nasinya basi"]);
    expect(ended).toBeUndefined();
    expect(appendDictated("Sudah dingin.  ", "nasinya basi")).toBe("Sudah dingin. nasinya basi");
    expect(appendDictated("", "nasinya basi")).toBe("nasinya basi");
  });

  test("a dictation error is reported once at the end", () => {
    let ended: string | undefined;
    startDictation(() => undefined, (error) => (ended = error), { webkitSpeechRecognition: FakeRecognition });
    FakeRecognition.last.onerror?.({ error: "network" });
    FakeRecognition.last.stop();
    expect(ended).toBe("network");
  });

  test("the device remembers only the id of its last report", () => {
    const store = memory();
    expect(lastReportId(store)).toBeNull();
    rememberReport("0b8c1d2e3f40", store);
    expect(lastReportId(store)).toBe("0b8c1d2e3f40");
    store.setItem(REPORTS_KEY, JSON.stringify(["../etc/passwd"]));
    expect(lastReportId(store)).toBeNull();
  });
});

describe("SCR-008 reports sent from this device", () => {
  test("newest first, no duplicates, capped", () => {
    const store = memory();
    expect(reportIds(store)).toEqual([]);
    rememberReport("aaa", store);
    rememberReport("bbb", store);
    rememberReport("aaa", store);
    expect(reportIds(store)).toEqual(["aaa", "bbb"]);
    expect(lastReportId(store)).toBe("aaa");
    for (let i = 0; i < MAX_REPORTS + 5; i++) rememberReport(`r${i}`, store);
    const ids = reportIds(store);
    expect(ids).toHaveLength(MAX_REPORTS);
    expect(ids[0]).toBe(`r${MAX_REPORTS + 4}`);
    expect(ids).not.toContain("aaa");
  });

  test("the single id of earlier builds is migrated into the list", () => {
    const store = memory();
    store.setItem(LAST_REPORT_KEY, "0b8c1d2e3f40");
    expect(reportIds(store)).toEqual(["0b8c1d2e3f40"]);
    expect(JSON.parse(store.values.get(REPORTS_KEY)!)).toEqual(["0b8c1d2e3f40"]);
    rememberReport("1c9d", store);
    expect(reportIds(store)).toEqual(["1c9d", "0b8c1d2e3f40"]);
    expect(store.values.get(LAST_REPORT_KEY)).toBe("1c9d"); // still written for older builds
  });

  test("a tampered legacy id or list is not trusted", () => {
    const legacy = memory();
    legacy.setItem(LAST_REPORT_KEY, "../etc/passwd");
    expect(reportIds(legacy)).toEqual([]);
    expect(lastReportId(legacy)).toBeNull();

    const broken = memory();
    broken.setItem(REPORTS_KEY, "{not json");
    broken.setItem(LAST_REPORT_KEY, "abc");
    expect(reportIds(broken)).toEqual(["abc"]); // unreadable list: start again from the legacy id

    const mixed = memory();
    mixed.setItem(REPORTS_KEY, JSON.stringify(["ok_1", 42, "<script>", "x".repeat(65), "ok-2", "ok_1"]));
    expect(reportIds(mixed)).toEqual(["ok_1", "ok-2"]);

    rememberReport("bad id!", mixed);
    expect(reportIds(mixed)).toEqual(["ok_1", "ok-2"]);
  });

  test("waiting questions are shown on a report only when they surely belong to it (TXT-WIT-162)", () => {
    const ok = (id: string, status: "draft" | "submitted") => ({ state: "ok", report: { id, status } }) as never;
    const entries = { a: ok("a", "submitted"), b: ok("b", "draft") };
    expect(questionsReport(["a", "b"], entries, 2)).toBe("a");
    expect(questionsReport(["a", "b"], entries, 0)).toBeNull();
    // Two submitted reports: the service does not say which case a question comes from.
    expect(questionsReport(["a", "c"], { a: entries.a, c: ok("c", "submitted") }, 1)).toBeNull();
    // A row still loading or failed could be another submitted report.
    expect(questionsReport(["a", "d"], { a: entries.a, d: { state: "error" } }, 1)).toBeNull();
    expect(questionsReport(["a", "d"], { a: entries.a }, 1)).toBeNull();
    // A full list may have dropped older reports of this device.
    const full = Array.from({ length: MAX_REPORTS }, (_, i) => (i === 0 ? "a" : `x${i}`));
    const fullEntries = Object.fromEntries(full.map((id) => [id, ok(id, id === "a" ? "submitted" : "draft")]));
    expect(questionsReport(full, fullEntries, 1)).toBeNull();
  });

  test("report code and row title", () => {
    expect(reportCodeOf("0123456789abcdef")).toBe("RPT-0123456789ab");
    const pack = { categories: [{ id: "keracunan", label: { id: "Keracunan", en: "Poisoning" } }] };
    const report = {
      category: "keracunan",
      region: { district_name: "Kecamatan Cibening (fictional)", regency_name: "Kabupaten Sukamaju" },
    };
    // Test doubles carry only the fields reportTitle reads.
    const title = (r: object, p: object | null) => reportTitle(r as never, p as never);
    expect(title(report, pack)).toBe("Keracunan di Kecamatan Cibening (fictional)");
    expect(title({ category: null, region: null }, pack)).toBe("Laporan");
    expect(title({ category: "unknown", region: null }, null)).toBe("unknown");
  });

  test("the day of a report is shown in WIB per language", () => {
    expect(formatDay("2026-10-15T20:00:00Z")).toBe("16 Okt 2026");
    expect(formatDay("2026-10-15T20:00:00Z", "en")).toBe("Oct 16, 2026");
  });
});

describe("SCR-009 language", () => {
  test("Indonesian by default, whatever the browser says; the choice is remembered", () => {
    const store = memory();
    expect(savedLanguage(store)).toBe("id");
    saveLanguage("en", store);
    expect(store.values.get(LANGUAGE_KEY)).toBe("en");
    expect(savedLanguage(store)).toBe("en");
    store.setItem(LANGUAGE_KEY, "fr");
    expect(savedLanguage(store)).toBe("id");
  });

  test("any catalogue language can be kept; only languages with texts change the UI", () => {
    const store = memory();
    expect(savedPreference(store)).toBe("id");
    saveLanguage("su", store);
    expect(savedPreference(store)).toBe("su");
    expect(savedLanguage(store)).toBe("id"); // no Sundanese texts yet: the UI stays Indonesian
    saveLanguage("xx", store); // not in the catalogue: ignored
    expect(savedPreference(store)).toBe("su");
    expect(LANGUAGE_CATALOG.length).toBe(11);
  });

  test("the catalogue is searched by own name, Indonesian name or code", () => {
    expect(searchLanguages("").length).toBe(LANGUAGE_CATALOG.length);
    expect(searchLanguages("inggris").map((l) => l.code)).toEqual(["en"]);
    expect(searchLanguages("EN").map((l) => l.code)).toEqual(["en"]);
    expect(searchLanguages("sunda").map((l) => l.code)).toEqual(["su"]);
    expect(searchLanguages("klingon")).toEqual([]);
  });

  test("only a region name is kept, never coordinates", () => {
    const store = memory();
    expect(savedRegion(store)).toBeNull();
    saveRegion("Kabupaten Sukamaju (fictional)", store);
    expect(store.values.get(REGION_KEY)).toBe("Kabupaten Sukamaju (fictional)");
    saveRegion(null, store);
    expect(savedRegion(store)).toBeNull();
  });

  test("the device language is only a suggestion", () => {
    expect(suggestedLanguage(["en-US", "id"])).toBe("en");
    expect(suggestedLanguage(["fr-FR", "id-ID"])).toBe("id");
    expect(suggestedLanguage(["de"])).toBe("id");
    expect(suggestedLanguage([])).toBe("id");
  });

  test("switching swaps the texts; a missing English text falls back to Indonesian", () => {
    try {
      setLanguage("en");
      expect(language()).toBe("en");
      expect(T["TXT-WIT-160"]).toBe("My reports");
      expect(t("TXT-WIT-020", { detik: 3 })).toBe("Voice note (3 seconds)");
      expect(pick({ id: "Keracunan", en: "Poisoning" })).toBe("Poisoning");
      expect(pick({ id: "Keracunan", en: "" })).toBe("Keracunan");
      const missing = (Object.keys(ID) as (keyof typeof ID)[]).filter((k) => !(k in EN));
      for (const key of missing) expect(T[key]).toBe(ID[key]);
    } finally {
      setLanguage("id");
    }
    expect(T["TXT-WIT-010"]).toBe("Laporkan kejadian");
    expect(pick({ id: "Keracunan", en: "Poisoning" })).toBe("Keracunan");
  });

  test("English covers the shell, tabs, SCR-008, SCR-009 and Bantuan", () => {
    expect(LANGUAGES).toEqual(["id", "en"]);
    const required = Object.keys(ID).filter((k) => /^TXT-WIT-(00[0-3]|1[6-9]\d|2\d\d|4\d\d)$/.test(k));
    expect(required.filter((k) => !(k in EN))).toEqual([]);
    expect(Object.keys(EN).filter((k) => !(k in ID))).toEqual([]); // no stray keys
  });

  test("the AI marker splits into a title and its text", () => {
    expect(splitFirstSentence(T["TXT-WIT-081"])).toEqual([
      "Hasil AI (Agen Intake)",
      "Periksa isinya. Perbaiki bagian yang belum tepat.",
    ]);
    expect(splitFirstSentence(T["TXT-WIT-050"])).toEqual(["Izin lokasi tidak diberikan", "Pilih kecamatan sendiri."]);
    expect(splitFirstSentence("Satu kalimat")).toEqual(["Satu kalimat", ""]);
  });

  test("no tab or button reads as a sign-in (anonymity, E2E /login|masuk/i)", () => {
    for (const id of ["TXT-WIT-405", "TXT-WIT-406", "TXT-WIT-160", "TXT-WIT-407", "TXT-WIT-408", "TXT-WIT-419"] as const) {
      expect(ID[id]).not.toMatch(/login|masuk/i);
      expect(EN[id] ?? "").not.toMatch(/login|sign.?in/i);
    }
  });
});

describe("SCR-004 attached evidence", () => {
  const evidence = (kind: "photo" | "audio" | "screenshot", id = "e1") => ({
    evidence_id: id,
    kind,
    media_type: "image/jpeg",
    sha256: "a".repeat(64),
    size_bytes: 1,
    metadata_removed: true,
  });
  const local = (kind: "photo" | "audio" | "screenshot", name: string, seconds?: number) => ({
    key: "k",
    kind,
    blob: new Blob(),
    name,
    previewUrl: "",
    seconds,
    evidenceId: "e1",
  });

  test("files picked on this device show their name; the service only knows the kind", () => {
    expect(evidenceRow(evidence("photo"), local("photo", "foto-1.jpg"))).toEqual({
      icon: "image",
      name: "foto-1.jpg",
      meta: "Info lokasi dan merek HP dihapus",
    });
    expect(evidenceRow(evidence("photo")).name).toBe("Foto");
    expect(evidenceRow(evidence("audio"), local("audio", "voice.webm", 14))).toEqual({
      icon: "mic",
      name: "Rekaman suara",
      meta: "14 detik",
    });
    expect(evidenceRow(evidence("screenshot"), local("screenshot", "post.png")).meta).toBe("Nama akun disamarkan");
  });
});

describe("domain packs", () => {
  const summary = (id: string) => ({ id, version: "1.0.0", name: { id, en: id }, categories: [], rules: [] });

  test("the configured default comes first, the others keep a stable order", () => {
    const ids = orderPacks([summary("general"), summary("bencana"), summary("mbg")], "general").map((p) => p.id);
    expect(ids).toEqual(["general", "bencana", "mbg"]);
    expect(orderPacks([summary("general"), summary("mbg")], "mbg").map((p) => p.id)).toEqual(["mbg", "general"]);
  });

  test("an unknown default does not drop any pack", () => {
    expect(orderPacks([summary("mbg"), summary("general")], "roads").map((p) => p.id)).toEqual(["general", "mbg"]);
  });

  test("the list comes from GET /v1/domain-packs", async () => {
    const calls: string[] = [];
    const client = new IngestionClient(loadConfig({}), async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify([summary("general")]), { status: 200 });
    });
    expect((await client.packs()).map((p) => p.id)).toEqual(["general"]);
    expect(calls[0]).toBe("http://localhost:8001/v1/domain-packs");
  });
});

describe("share target (SCR-007)", () => {
  test("a link in url is the post, and the text is the excerpt", () => {
    expect(parseShare({ url: "https://www.instagram.com/p/Cx1/", text: "Dapur ini bau basi", title: "" })).toEqual({
      url: "https://www.instagram.com/p/Cx1/",
      excerpt: "Dapur ini bau basi",
    });
  });

  test("a link at the end of the text is split from the caption, without trailing punctuation", () => {
    expect(parseShare({ text: "Lihat ini https://x.com/user/status/123." })).toEqual({
      url: "https://x.com/user/status/123",
      excerpt: "Lihat ini",
    });
    expect(parseShare({ text: "https://vt.tiktok.com/ZS8abc/" })).toEqual({ url: "https://vt.tiktok.com/ZS8abc/", excerpt: null });
  });

  test("the title is the excerpt when the text is only the link; a long excerpt is cut to the service limit", () => {
    expect(parseShare({ title: "Postingan warga", text: "https://facebook.com/groups/1/posts/2" })?.excerpt).toBe("Postingan warga");
    const long = parseShare({ text: `${"a".repeat(1500)} https://x.com/a/status/1` });
    expect(long?.excerpt).toHaveLength(1000);
  });

  test("text without a usable link is not a post", () => {
    expect(parseShare({ text: "tidak ada link di sini" })).toBeNull();
    expect(parseShare({ text: "ftp://example.com/file", url: "http://localhost" })).toBeNull();
    expect(parseShare({})).toBeNull();
  });

  test("a share without a link becomes the story text; an empty share is ignored", () => {
    expect(receive({ text: "  Air keruh sejak pagi  " })).toEqual({ post: null, narrative: "Air keruh sejak pagi" });
    expect(receive({ text: "x https://x.com/a/status/1" })?.post?.url).toBe("https://x.com/a/status/1");
    expect(receive({ text: " ", title: null })).toBeNull();
  });

  test("the PWA share target passes title, text and url as query parameters", () => {
    expect(fieldsFromQuery("?title=T&text=cap+https%3A%2F%2Fx.com%2Fa%2Fstatus%2F1&url=")).toEqual({
      title: "T",
      text: "cap https://x.com/a/status/1",
      url: "",
    });
    expect(fieldsFromQuery("?lang=en")).toBeNull();
    expect(fieldsFromQuery("")).toBeNull();
  });
});

describe("anonymous sign-in", () => {
  test("requests that start together share one anonymous user", async () => {
    let signIns = 0;
    const fake = {
      currentUser: null as null | { getIdToken: () => Promise<string> },
      authStateReady: () => Promise.resolve(),
    };
    mock.module("firebase/app", () => ({ getApps: () => [], getApp: () => ({}), initializeApp: () => ({}) }));
    mock.module("firebase/auth", () => ({
      getAuth: () => fake,
      initializeAuth: () => fake,
      indexedDBLocalPersistence: {},
      signInAnonymously: async () => {
        const uid = `uid-${++signIns}`;
        await new Promise((resolve) => setTimeout(resolve, 10)); // the network round trip
        const user = { getIdToken: () => Promise.resolve(`token-of-${uid}`) };
        fake.currentUser = user;
        return { user };
      },
    }));
    const { anonymousIdToken } = await import("./firebase");
    const config = { apiKey: "k", projectId: "p", authDomain: "p.firebaseapp.com" };

    const tokens = await Promise.all([anonymousIdToken(config), anonymousIdToken(config), anonymousIdToken(config)]);

    expect(signIns).toBe(1);
    expect(new Set(tokens)).toEqual(new Set(["token-of-uid-1"]));
    expect(await anonymousIdToken(config)).toBe("token-of-uid-1"); // later calls reuse the persisted user
    expect(signIns).toBe(1);
  });
});

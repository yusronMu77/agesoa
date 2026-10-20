import { describe, expect, test } from "bun:test";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  isCatalogLanguage,
  langFromAcceptLanguage,
  resolveLang,
  searchLanguages,
  translate,
} from "./core";
import { messages } from "./messages";

describe("language detection", () => {
  test("the cookie wins over the browser", () => {
    expect(resolveLang("en", "id-ID,id;q=0.9")).toBe("en");
    expect(resolveLang("id", "en-US,en;q=0.9")).toBe("id");
  });

  test("an unknown cookie falls back to Accept-Language, then Indonesian", () => {
    expect(resolveLang("fr", "en-US,en;q=0.9")).toBe("en");
    expect(resolveLang(undefined, "fr-FR,de;q=0.8")).toBe("id");
    expect(resolveLang(null, null)).toBe("id");
  });

  test("a planned catalogue language is kept as preference and shown in Indonesian", () => {
    expect(isCatalogLanguage("su")).toBe(true);
    expect(resolveLang("su", "en-US,en;q=0.9")).toBe("id");
  });

  test("language search by own name, Indonesian name or code", () => {
    expect(searchLanguages("sunda").map((l) => l.code)).toEqual(["su"]);
    expect(searchLanguages("inggris").map((l) => l.code)).toEqual(["en"]);
    expect(searchLanguages("ban").map((l) => l.code)).toEqual(["ban"]);
    expect(searchLanguages("  ").length).toBeGreaterThan(5);
    expect(searchLanguages("xyz")).toEqual([]);
  });

  test("Accept-Language is ranked by quality, ties keep header order", () => {
    expect(langFromAcceptLanguage("fr;q=0.9,en;q=0.5,id;q=0.8")).toBe("id");
    expect(langFromAcceptLanguage("en-GB,id")).toBe("en");
    expect(langFromAcceptLanguage("en;q=0,id;q=0.1")).toBe("id");
  });

  test("the legacy Indonesian code 'in' counts as Indonesian", () => {
    expect(langFromAcceptLanguage("in-ID,en;q=0.5")).toBe("id");
  });
});

describe("messages", () => {
  test("every surface has the same keys in both languages", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.id).sort());
  });

  test("no empty message", () => {
    for (const lang of ["id", "en"] as const) {
      for (const [key, value] of Object.entries(messages[lang])) expect(value.trim(), `${lang} ${key}`).not.toBe("");
    }
  });

  test("placeholders are filled and unknown ones are kept", () => {
    expect(translate("en", "common.language.current", { lang: "English" })).toBe("Language: English");
    expect(translate("id", "common.language.current")).toBe("Bahasa: {lang}");
  });

  test("the English texts asserted by the QA suite stay the same", () => {
    expect(translate("en", "nav.main")).toBe("Main");
    expect(translate("en", "notFound.title")).toBe("Page not found");
  });
});

describe("dates in Western Indonesia Time", () => {
  test("formats like the design: 16 Okt 2026, 10.42 WIB / Oct 16, 2026, 10:42 AM WIB", () => {
    expect(formatDateTime("id", "2026-10-16T03:42:00Z")).toBe("16 Okt 2026, 10.42 WIB");
    expect(formatDateTime("en", "2026-10-16T03:42:00Z")).toBe("Oct 16, 2026, 10:42 AM WIB");
  });

  test("the calendar day and clock follow Asia/Jakarta (UTC+7), not the server zone", () => {
    // 17:05 UTC is already the next day in Jakarta; 12-hour clock in English, 24-hour in Indonesian.
    expect(formatDateTime("id", "2026-10-16T17:05:00Z")).toBe("17 Okt 2026, 00.05 WIB");
    expect(formatDateTime("en", "2026-10-16T17:05:00Z")).toBe("Oct 17, 2026, 12:05 AM WIB");
    expect(formatDateTime("en", "2026-10-16T08:30:00Z")).toBe("Oct 16, 2026, 3:30 PM WIB");
    expect(formatDateTime("id", "2026-10-16T08:30:00Z")).toBe("16 Okt 2026, 15.30 WIB");
    expect(formatDateTime("id", "2026-05-02T01:00:00Z")).toBe("2 Mei 2026, 08.00 WIB");
  });

  test("date only and time only use the same locale rules", () => {
    expect(formatDate("id", "2026-10-16T17:05:00Z")).toBe("17 Okt 2026");
    expect(formatDate("en", "2026-10-16T17:05:00Z")).toBe("Oct 17, 2026");
    expect(formatTime("id", "2026-10-16T03:42:07Z", true)).toBe("10.42.07 WIB");
    expect(formatTime("en", "2026-10-16T13:42:07Z")).toBe("8:42 PM WIB");
    expect(formatDate("en", "nope")).toBe("nope");
    expect(formatDate("id", undefined)).toBe("—");
  });

  test("numbers follow the locale", () => {
    expect(formatNumber("id", 12345)).toBe("12.345");
    expect(formatNumber("en", 12345)).toBe("12,345");
  });

  test("a missing or invalid timestamp never throws", () => {
    expect(formatDateTime("id", null)).toBe("—");
    expect(formatDateTime("en", "not-a-date")).toBe("not-a-date");
  });
});

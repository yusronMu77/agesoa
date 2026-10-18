import { describe, expect, test } from "bun:test";
import { formatDateTime, langFromAcceptLanguage, resolveLang, translate } from "./core";
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
  test("formats like the design: 16 Okt 2026, 10.42 WIB / 16 Oct 2026, 10:42 WIB", () => {
    expect(formatDateTime("id", "2026-10-16T03:42:00Z")).toBe("16 Okt 2026, 10.42 WIB");
    expect(formatDateTime("en", "2026-10-16T03:42:00Z")).toBe("16 Oct 2026, 10:42 WIB");
  });

  test("a missing or invalid timestamp never throws", () => {
    expect(formatDateTime("id", null)).toBe("—");
    expect(formatDateTime("en", "not-a-date")).toBe("not-a-date");
  });
});

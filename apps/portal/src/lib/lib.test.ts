import { describe, expect, test } from "bun:test";
import { checkboxField, optionalField, textField } from "./form-data";
import { formatTime, shortHash } from "./format";
import { parseSeq, stringParam } from "./page-props";
import { safeLink } from "./safe-link";

describe("form fields", () => {
  test("optional text fields: trimmed, empty is null", () => {
    expect(optionalField("  3201 ")).toBe("3201");
    expect(optionalField("   ")).toBeNull();
    expect(optionalField(null)).toBeNull();
  });

  test("text and checkbox fields", () => {
    const form = new FormData();
    form.set("note", "ok");
    form.set("conflict", "on");
    expect(textField(form, "note")).toBe("ok");
    expect(textField(form, "missing")).toBe("");
    expect(checkboxField(form, "conflict")).toBe(true);
    expect(checkboxField(form, "missing")).toBe(false);
  });
});

describe("page parameters", () => {
  test("sequence numbers are non-negative integers", () => {
    expect(parseSeq("42")).toBe(42);
    expect(parseSeq(["7", "8"])).toBe(7);
    expect(parseSeq("-1")).toBeUndefined();
    expect(parseSeq("1e3")).toBeUndefined();
    expect(parseSeq(undefined)).toBeUndefined();
  });

  test("a query parameter counts only when given once", () => {
    expect(stringParam("x")).toBe("x");
    expect(stringParam(["x", "y"])).toBeUndefined();
  });
});

describe("formatting", () => {
  test("times in UTC, hashes shortened", () => {
    expect(formatTime("2026-10-13T07:05:09.123Z")).toBe("2026-10-13 07:05:09 UTC");
    expect(formatTime(null)).toBe("—");
    expect(shortHash("a".repeat(64))).toBe(`${"a".repeat(12)}…`);
    expect(shortHash(null)).toBe("—");
  });
});

describe("links from third parties", () => {
  test("only http(s) links are rendered", () => {
    expect(safeLink("https://agency.test/doc.pdf")).toBe("https://agency.test/doc.pdf");
    expect(safeLink("http://agency.test/a b")).toBe("http://agency.test/a%20b");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("data:text/html,x")).toBeNull();
    expect(safeLink("/relative")).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});

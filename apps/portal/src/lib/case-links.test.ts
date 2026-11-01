import { describe, expect, test } from "bun:test";
import { organizationCaseLinks, publicCaseLinks, validatorCaseLinks } from "@/lib/case-links";
import type { Translate } from "@/lib/i18n/core";
import { surfaceOf } from "@/lib/routes";

const t: Translate = (key) => key;

const hrefs = (l: ReturnType<typeof publicCaseLinks>) => [...l.crumbs.map((c) => c.href), l.case, l.report, `${l.log}/1`];

describe("case page links", () => {
  test("the public case pages link the public pages", () => {
    const l = publicCaseLinks("C 1", t);
    expect(l).toMatchObject({ case: "/cases/C%201", report: "/cases/C%201/report", log: "/log" });
    for (const href of hrefs(l)) expect(surfaceOf(href)).toBe("public");
  });

  test("a validator's case pages never leave the validator console, and lead back to the finding", () => {
    const l = validatorCaseLinks("F-1", t);
    expect(l).toMatchObject({ case: "/validators/findings/F-1/case", report: "/validators/findings/F-1/case/report" });
    expect(l.crumbs.at(-1)).toEqual({ href: "/validators/findings/F-1", label: "F-1" });
    for (const href of hrefs(l)) expect(surfaceOf(href)).toBe("validator");
  });

  test("an organization's case pages never leave the organization console", () => {
    const l = organizationCaseLinks("ORG-1", "C-1", t);
    expect(l).toMatchObject({ case: "/organizations/ORG-1/cases/C-1", report: "/organizations/ORG-1/cases/C-1/report" });
    for (const href of hrefs(l)) expect(surfaceOf(href)).toBe("institution");
  });
});

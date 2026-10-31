import { describe, expect, test } from "bun:test";
import { messages } from "@/lib/i18n/messages";
import { ROLE_ENTRIES } from "@/lib/role-switch";
import { canonicalPath, surfaceOf } from "@/lib/routes";

describe("role switcher", () => {
  test("lists the four surfaces in the design order, the public one as the current surface", () => {
    expect(ROLE_ENTRIES.map((e) => e.role)).toEqual(["public", "validator", "institution", "ops"]);
    expect(ROLE_ENTRIES[0]).toMatchObject({ signIn: null, register: null });
  });

  test("every other surface has exactly a sign-in and a registration page of its own surface", () => {
    expect(ROLE_ENTRIES.slice(1).map((e) => [e.signIn, e.register])).toEqual([
      ["/validators/login", "/validators/register"],
      ["/organizations/login", "/organizations/login?signup=1"],
      ["/ops/login", "/ops/login?signup=1"],
    ]);
    // Registration never leads to another surface (no mixed menus, DESIGN-BRIEF §1).
    expect(surfaceOf(canonicalPath("/validators/register"))).toBe("validator");
    expect(surfaceOf(canonicalPath("/organizations/login"))).toBe("institution");
    expect(surfaceOf(canonicalPath("/ops/login?signup=1"))).toBe("ops");
  });

  test("labels and notes exist in both languages", () => {
    for (const e of ROLE_ENTRIES) {
      for (const key of [e.label, e.note].filter(Boolean) as (keyof typeof messages.id)[]) {
        expect(messages.id[key]).toBeTruthy();
        expect(messages.en[key]).toBeTruthy();
      }
    }
    expect(messages.id["common.role.organization"]).toBe("Organisasi");
  });
});

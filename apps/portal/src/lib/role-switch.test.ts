import { describe, expect, test } from "bun:test";
import { messages } from "@/lib/i18n/messages";
import { claimedRoles, ROLE_ENTRIES } from "@/lib/role-switch";
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

  test("a signed-in role opens its own console", () => {
    expect(ROLE_ENTRIES.map((e) => [e.role, e.home])).toEqual([
      ["public", null],
      ["validator", "/validators"],
      ["institution", "/organizations"],
      ["ops", "/ops"],
    ]);
    for (const key of ["common.roleSwitch.open", "common.roleSwitch.openAs"] as const) {
      expect(messages.id[key]).toBeTruthy();
      expect(messages.en[key]).toBeTruthy();
    }
  });

  test("console roles come from the token's role claims, only when the claim is true", () => {
    expect(claimedRoles({ validator: true })).toEqual(["validator"]);
    expect(claimedRoles({ validator: true, org_admin: true, operator: true })).toEqual(["validator", "institution", "ops"]);
    expect(claimedRoles({ org_admin: true })).toEqual(["institution"]);
    // A reader's or anonymous reporter's token, a claim that is not `true`, no claims at all: no console.
    expect(claimedRoles({ sub: "u1", firebase: { sign_in_provider: "anonymous" } })).toEqual([]);
    expect(claimedRoles({ validator: "true", operator: 1 })).toEqual([]);
    expect(claimedRoles(null)).toEqual([]);
  });
});

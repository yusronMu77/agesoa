import { describe, expect, test } from "bun:test";
import { isActivePath } from "@/hooks/use-active-path.hook";
import { validatorLabel } from "./validated-by";

describe("validator labels", () => {
  test("role + tier + regency, never a name; older documents fall back to the tier", () => {
    expect(validatorLabel({ tier: "high", decision: "approve", role_label: "Journalist", regency_name: "Kabupaten X" })).toBe(
      "Journalist (high tier), Kabupaten X",
    );
    expect(validatorLabel({ tier: "medium", decision: "approve" })).toBe("medium tier validator");
  });
});

describe("active navigation", () => {
  test("a section is active on its own page and its sub-pages; home only on itself", () => {
    expect(isActivePath("/log/12", "/log")).toBe(true);
    expect(isActivePath("/logout", "/log")).toBe(false);
    expect(isActivePath("/dashboard", "/")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});

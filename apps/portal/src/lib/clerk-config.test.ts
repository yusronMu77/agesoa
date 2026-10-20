import { expect, test } from "bun:test";
import { clerkEnabled } from "./clerk-config";
test("Clerk is enabled only with both keys, never with incomplete configuration", () => {
  expect(clerkEnabled({})).toBe(false);
  expect(clerkEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test" })).toBe(false);
  expect(clerkEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test", CLERK_SECRET_KEY: " " })).toBe(false);
  expect(clerkEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test", CLERK_SECRET_KEY: "test" })).toBe(true);
});

import { describe, expect, test } from "bun:test";
import { hasNextPage, pageAfterOf, previousAfter } from "./log-pages";

describe("decision log pages", () => {
  test("previous page", () => {
    expect(previousAfter(0)).toBeNull();
    expect(previousAfter(50)).toBe(0);
    expect(previousAfter(120)).toBe(70);
    expect(previousAfter(20)).toBe(0);
  });

  test("next page only before the head", () => {
    expect(hasNextPage(null, 200)).toBe(false);
    expect(hasNextPage(50, 200)).toBe(true);
    expect(hasNextPage(200, 200)).toBe(false);
    expect(hasNextPage(50, null)).toBe(true);
  });

  test("page of an entry", () => {
    expect(pageAfterOf(1)).toBe(0);
    expect(pageAfterOf(50)).toBe(0);
    expect(pageAfterOf(51)).toBe(50);
  });
});

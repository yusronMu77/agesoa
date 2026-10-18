import { describe, expect, test } from "bun:test";
import { localizedList, localizedText } from "./localized";

const BOTH = { id: "Satu dapur melayani 34 sekolah.", en: "One kitchen serves 34 schools." };

describe("producer text per language", () => {
  test("the reader's language wins when the producer wrote it; the UI default is English", () => {
    expect(localizedText("plain", BOTH)).toBe(BOTH.en);
    expect(localizedText("plain", BOTH, "id")).toBe(BOTH.id);
  });

  test("without that language the plain field is shown as it is (no translation)", () => {
    expect(localizedText("Plain", { id: "Hanya Indonesia" })).toBe("Plain");
    expect(localizedText("Plain", null)).toBe("Plain");
  });

  test("an empty plain field falls back to any language the producer wrote", () => {
    expect(localizedText("", { id: "Hanya Indonesia" })).toBe("Hanya Indonesia");
    expect(localizedText(null, null)).toBe("");
  });

  test("recommendations are paired one to one, else the plain list is used", () => {
    expect(localizedList(["A", "B"], [{ en: "A-en" }, null])).toEqual(["A-en", "B"]);
    expect(localizedList(["A", "B"], [{ en: "only one" }])).toEqual(["A", "B"]);
  });
});

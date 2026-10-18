import { describe, expect, test } from "bun:test";
import { localizedList, localizedText } from "./localized";

const BOTH = { id: "Satu dapur melayani 34 sekolah.", en: "One kitchen serves 34 schools." };

describe("producer text per language", () => {
  test("the reader's language wins when the producer wrote it", () => {
    expect(localizedText("id", BOTH.en, BOTH)).toEqual({ text: BOTH.id, lang: "id" });
    expect(localizedText("en", BOTH.en, BOTH)).toEqual({ text: BOTH.en, lang: "en" });
  });

  test("without that language the plain field is shown as it is (no translation)", () => {
    expect(localizedText("id", "Plain English", { en: "English" })).toEqual({ text: "Plain English" });
    expect(localizedText("id", "Plain", null)).toEqual({ text: "Plain" });
  });

  test("an empty plain field falls back to any language the producer wrote", () => {
    expect(localizedText("en", "", { id: "Hanya Indonesia" })).toEqual({ text: "Hanya Indonesia", lang: "id" });
    expect(localizedText("en", null, null)).toEqual({ text: "" });
  });

  test("recommendations are paired one to one, else the plain list is used", () => {
    const plain = ["A", "B"];
    expect(localizedList("id", plain, [{ id: "A-id" }, null]).map((s) => s.text)).toEqual(["A-id", "B"]);
    expect(localizedList("id", plain, [{ id: "only one" }]).map((s) => s.text)).toEqual(["A", "B"]);
  });
});

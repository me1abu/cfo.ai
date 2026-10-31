import { describe, expect, it } from "vitest";
import { stripMarkdown } from "./plain-text";

describe("stripMarkdown", () => {
  it("removes bold, headings and code marks, and normalises bullets", () => {
    expect(stripMarkdown("**أكبر عملائك**\n\n## Totals\n* one\n- two\nUse `INV-1`")).toBe(
      "أكبر عملائك\n\nTotals\n- one\n- two\nUse INV-1",
    );
  });

  it("leaves plain text, hyphenated words and lone asterisks alone", () => {
    const s = "Net VAT is 0 SAR - credit notes count. 5 * 3 = 15";
    expect(stripMarkdown(s)).toBe(s);
  });
});

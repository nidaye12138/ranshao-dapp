import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpolate, messages } from "./messages.ts";
import { detectBrowserLocale } from "./types.ts";

describe("i18n messages", () => {
  it("keeps brand tokens in both locales", () => {
    for (const locale of ["zh", "en"] as const) {
      const blob = JSON.stringify(messages[locale]);
      assert.match(blob, /Umidor/);
      assert.match(blob, /UMplan/);
      assert.match(blob, /SPCXB/);
    }
  });

  it("English intro does not list Market3–Market9 generations", () => {
    const intro = [
      ...messages.en.home.rules,
      messages.en.promo.earnMarket,
      messages.en.home.slides.map((s) => s.subtitle).join(" "),
    ].join("\n");
    assert.doesNotMatch(intro, /Market[3-9]|L[3-9]/);
    assert.match(intro, /market 10%/i);
    assert.match(intro, /30%/);
    assert.match(intro, /50%/);
    assert.match(intro, /15%/);
    assert.match(intro, /5%/);
  });

  it("interpolates placeholders", () => {
    assert.equal(interpolate("fee {fee}% floor {floor}", { fee: 3.5, floor: 3 }), "fee 3.5% floor 3");
  });

  it("detectBrowserLocale maps zh* to zh", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { language: "zh-CN" },
    });
    assert.equal(detectBrowserLocale(), "zh");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { language: "en-US" },
    });
    assert.equal(detectBrowserLocale(), "en");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  });
});

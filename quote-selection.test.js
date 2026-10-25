import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import "./quote-selection.js";

const { fallbackQuote, getDayOfYear, selectQuoteForDate } =
  globalThis.DailyQuoteSelection;
const bundledQuotes = JSON.parse(
  readFileSync(new URL("./quotes.json", import.meta.url), "utf8"),
);

function makeQuotes(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `quote-${index + 1}`,
    bg: { text: `Мисъл ${index + 1}`, author: "Неизвестен" },
  }));
}

describe("daily quote selection", () => {
  it("returns the same quote for the same local date", () => {
    const quotes = makeQuotes(366);
    const date = new Date(2026, 5, 18, 23, 59);

    assert.equal(
      selectQuoteForDate(date, quotes),
      selectQuoteForDate(new Date(2026, 5, 18, 1), quotes),
    );
  });

  it("selects a different quote on consecutive dates", () => {
    const quotes = makeQuotes(366);
    const today = new Date(2026, 6, 10);
    const tomorrow = new Date(2026, 6, 11);

    assert.notEqual(
      selectQuoteForDate(today, quotes),
      selectQuoteForDate(tomorrow, quotes),
    );
  });

  it("uses consecutive day indexes through February 29 in leap years", () => {
    const february28 = new Date(2024, 1, 28);
    const leapDay = new Date(2024, 1, 29);
    const march1 = new Date(2024, 2, 1);

    assert.equal(getDayOfYear(february28), 59);
    assert.equal(getDayOfYear(leapDay), 60);
    assert.equal(getDayOfYear(march1), 61);
  });

  it("wraps deterministically from December 31 to January 1", () => {
    const quotes = makeQuotes(366);
    const leapYearEnd = new Date(2024, 11, 31);
    const nextYearStart = new Date(2025, 0, 1);
    const ordinaryYearEnd = new Date(2025, 11, 31);
    const followingYearStart = new Date(2026, 0, 1);

    assert.equal(getDayOfYear(leapYearEnd), 366);
    assert.equal(getDayOfYear(nextYearStart), 1);
    assert.equal(getDayOfYear(ordinaryYearEnd), 365);
    assert.equal(getDayOfYear(followingYearStart), 1);
    assert.notEqual(
      selectQuoteForDate(leapYearEnd, quotes),
      selectQuoteForDate(nextYearStart, quotes),
    );
    assert.notEqual(
      selectQuoteForDate(ordinaryYearEnd, quotes),
      selectQuoteForDate(followingYearStart, quotes),
    );
    assert.equal(
      selectQuoteForDate(new Date(2024, 0, 1), quotes),
      selectQuoteForDate(new Date(2025, 0, 1), quotes),
    );
  });

  it("uses the Bulgarian default for missing, empty, or malformed quote lists", () => {
    const date = new Date(2026, 0, 1);
    const malformed = [{ bg: { text: "Липсва автор" } }];

    assert.equal(Object.hasOwn(fallbackQuote, "en"), false);
    assert.equal(selectQuoteForDate(date, undefined), fallbackQuote);
    assert.equal(selectQuoteForDate(date, []), fallbackQuote);
    assert.equal(selectQuoteForDate(date, malformed), fallbackQuote);
    assert.equal(selectQuoteForDate(new Date(Number.NaN), makeQuotes(1)), fallbackQuote);
  });

  it("accepts Bulgarian quotes without an English translation", () => {
    const quote = {
      id: "bulgarian-only",
      bg: { text: "Само на български.", author: "Неизвестен" },
    };

    assert.equal(selectQuoteForDate(new Date(2026, 0, 1), [quote]), quote);
  });

  it("offers 366 different choices within a leap year", () => {
    const selectedIds = new Set();

    for (let day = 0; day < 366; day += 1) {
      const date = new Date(2024, 0, 1 + day);
      selectedIds.add(selectQuoteForDate(date, bundledQuotes).id);
    }

    assert.equal(selectedIds.size, 366);
  });

  it("ships 366 unique Bulgarian quotes attributed as unknown", () => {
    assert.equal(bundledQuotes.length, 366);
    assert.equal(new Set(bundledQuotes.map((quote) => quote.bg.text)).size, 366);
    assert.ok(
      bundledQuotes.every(
        (quote) =>
          quote.bg.author === "Неизвестен" &&
          !Object.hasOwn(quote, "en") &&
          quote.attribution,
      ),
    );
  });
});

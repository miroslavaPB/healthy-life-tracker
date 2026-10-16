import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "./habit-analysis.js";

const { analyzeHabitRecords } = globalThis.HabitAnalysis;
const definitions = {
  water: { max: 10000, decimals: 0 },
  sleep: { max: 24, decimals: 1 },
  exercise: { max: 1440, decimals: 0 },
};
const goals = { water: 2000, sleep: 8, exercise: 30 };

describe("habit coach analysis", () => {
  it("averages only recorded values and compares them with goals", () => {
    const result = analyzeHabitRecords(
      {
        "2026-10-09": { water: 1000, sleep: 7, exercise: 0 },
        "2026-10-10": { water: 3000, sleep: 9, exercise: 30 },
      },
      goals,
      "7",
      "2026-10-15",
      definitions,
    );

    assert.equal(result.daysWithRecords, 2);
    assert.deepEqual(result.metrics.water, {
      count: 2,
      average: 2000,
      minimum: 1000,
      maximum: 3000,
      goal: 2000,
      goalMetCount: 1,
      pattern: null,
    });
    assert.equal(result.metrics.sleep.average, 8);
    assert.equal(result.metrics.sleep.goalMetCount, 1);
    assert.equal(result.metrics.exercise.count, 2);
    assert.equal(result.metrics.exercise.average, 15);
    assert.equal(result.metrics.exercise.goalMetCount, 1);
  });

  it("excludes missing days and counts an explicit zero as a valid value", () => {
    const result = analyzeHabitRecords(
      {
        "2026-10-09": { water: 1000 },
        "2026-10-10": { exercise: 0 },
      },
      goals,
      "7",
      "2026-10-15",
      definitions,
    );

    assert.equal(result.dateCount, 2);
    assert.equal(result.daysWithRecords, 2);
    assert.equal(result.metrics.water.count, 1);
    assert.equal(result.metrics.water.average, 1000);
    assert.equal(result.metrics.exercise.count, 1);
    assert.equal(result.metrics.exercise.average, 0);
    assert.equal(result.metrics.sleep.count, 0);
    assert.equal(result.metrics.sleep.average, null);
  });

  it("returns an empty analysis for empty records", () => {
    const result = analyzeHabitRecords({}, goals, "all", "2026-10-15", definitions);

    assert.equal(result.dateCount, 0);
    assert.equal(result.daysWithRecords, 0);
    assert.ok(Object.values(result.metrics).every((metric) => metric.count === 0));
    assert.ok(Object.values(result.metrics).every((metric) => metric.average === null));
    assert.ok(Object.values(result.metrics).every((metric) => metric.pattern === null));
  });

  it("does not report a pattern before three valid measurements", () => {
    const twoValues = analyzeHabitRecords(
      {
        "2026-10-09": { water: 1000 },
        "2026-10-10": { water: 3000 },
      },
      goals,
      "7",
      "2026-10-15",
      definitions,
    );
    const threeValues = analyzeHabitRecords(
      {
        "2026-10-09": { water: 1000 },
        "2026-10-10": { water: 3000 },
        "2026-10-11": { water: 2500 },
      },
      goals,
      "7",
      "2026-10-15",
      definitions,
    );

    assert.equal(twoValues.metrics.water.pattern, null);
    assert.deepEqual(threeValues.metrics.water.pattern, {
      minimum: 1000,
      maximum: 3000,
      average: 6500 / 3,
      goalStatus: "at-or-above",
    });
  });

  it("uses all valid dates, excludes future dates from recent periods, and ignores invalid values", () => {
    const records = {
      "2026-09-01": { water: 1500 },
      "2026-10-10": { water: 2500, exercise: -1 },
      "2026-10-16": { water: 5000 },
      "2026-02-30": { sleep: 8 },
    };
    const recent = analyzeHabitRecords(records, goals, "7", "2026-10-15", definitions);
    const all = analyzeHabitRecords(records, goals, "all", "2026-10-15", definitions);

    assert.equal(recent.metrics.water.count, 1);
    assert.equal(recent.daysWithRecords, 1);
    assert.equal(all.metrics.water.count, 3);
    assert.equal(all.daysWithRecords, 3);
  });

  it("rejects unsupported periods and invalid analysis dates", () => {
    assert.throws(
      () => analyzeHabitRecords({}, goals, "year", "2026-10-15", definitions),
      RangeError,
    );
    assert.throws(
      () => analyzeHabitRecords({}, goals, "all", "2026-02-30", definitions),
      TypeError,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "./data-backup.js";

const { createBackupXml, importBackup, validateBackup } = globalThis.HealthyLifeBackup;

const validBackup = {
  version: 2,
  records: {
    "2026-10-15": { water: 1800, sleep: 7.5, exercise: 30 },
  },
  goals: { water: 2000, sleep: 8, exercise: 30 },
};

function createStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem() {
      return value;
    },
    setItem(key, nextValue) {
      value = nextValue;
    },
  };
}

describe("healthy life tracker data backups", () => {
  it("exports the complete supported data structure as XML", () => {
    const xml = createBackupXml(validBackup);

    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<healthyLifeTrackerBackup version="2">/);
    assert.match(xml, /<record date="2026-10-15">/);
    assert.match(xml, /<water>1800<\/water>/);
    assert.match(xml, /<sleep>7\.5<\/sleep>/);
    assert.match(xml, /<exercise>30<\/exercise>/);
    assert.deepEqual(validateBackup(validBackup), validBackup);
  });

  it("imports validated data and restores records and goals", () => {
    const storage = createStorage("existing-data");
    const result = importBackup(storage, "dailywell-tracker-v2", validBackup, () => true);

    assert.equal(result.imported, true);
    assert.deepEqual(result.data, validBackup);
    assert.deepEqual(JSON.parse(storage.getItem("dailywell-tracker-v2")), validBackup);
  });

  it("rejects empty or non-object backup data without changing existing data", () => {
    const storage = createStorage("existing-data");

    assert.throws(() => validateBackup(null), /валиден архив/);
    assert.throws(() => importBackup(storage, "key", null, () => true));
    assert.equal(storage.getItem("key"), "existing-data");
  });

  it("rejects unsupported, incomplete, and invalid backup data before writing", () => {
    const storage = createStorage("existing-data");
    const missingGoals = { version: 2, records: {} };
    const invalidRecord = {
      ...validBackup,
      records: { "2026-02-30": { water: 1000 } },
    };
    const invalidGoal = {
      ...validBackup,
      goals: { ...validBackup.goals, sleep: 8.25 },
    };

    assert.throws(
      () => importBackup(storage, "key", { ...validBackup, version: 1 }, () => true),
      /не се поддържа/,
    );
    assert.throws(() => importBackup(storage, "key", missingGoals, () => true));
    assert.throws(() => importBackup(storage, "key", invalidRecord, () => true));
    assert.throws(() => importBackup(storage, "key", invalidGoal, () => true));
    assert.equal(storage.getItem("key"), "existing-data");
  });

  it("keeps existing data when the user cancels replacement", () => {
    const storage = createStorage("existing-data");
    let confirmationRequested = false;
    const result = importBackup(storage, "key", validBackup, () => {
      confirmationRequested = true;
      return false;
    });

    assert.equal(confirmationRequested, true);
    assert.deepEqual(result, { imported: false });
    assert.equal(storage.getItem("key"), "existing-data");
  });

  it("restores a valid empty backup without losing its goals", () => {
    const emptyBackup = { version: 2, records: {}, goals: validBackup.goals };
    const storage = createStorage("existing-data");

    const result = importBackup(storage, "key", emptyBackup, () => true);

    assert.equal(result.imported, true);
    assert.deepEqual(JSON.parse(storage.getItem("key")), emptyBackup);
  });

  it("does not overwrite existing data when storage rejects the write", () => {
    const storage = {
      getItem() {
        return "existing-data";
      },
      setItem() {
        throw new Error("Storage is unavailable.");
      },
    };

    assert.throws(
      () => importBackup(storage, "key", validBackup, () => true),
      /Storage is unavailable/,
    );
    assert.equal(storage.getItem("key"), "existing-data");
  });

  it("rejects unsupported habit fields", () => {
    const invalidRecords = {
      ...validBackup,
      records: { "2026-10-15": { ...validBackup.records["2026-10-15"], steps: 1000 } },
    };

    assert.throws(() => validateBackup(invalidRecords), /невалидни стойности/);
  });
});

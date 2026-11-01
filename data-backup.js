(function registerDataBackup(global) {
  const habitDefinitions = {
    water: { max: 10000, decimals: 0 },
    sleep: { max: 24, decimals: 1 },
    exercise: { max: 1440, decimals: 0 },
  };
  const habitNames = Object.keys(habitDefinitions);
  const backupFields = ["version", "records", "goals"];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isValidDateKey(dateKey) {
    if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
    if (Number(dateKey.slice(0, 4)) < 100) return false;

    const date = new Date(`${dateKey}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey;
  }

  function isValidHabitValue(value, habit, allowZero) {
    const definition = habitDefinitions[habit];
    return (
      Number.isFinite(value) &&
      (allowZero ? value >= 0 : value > 0) &&
      value <= definition.max &&
      (definition.decimals > 0
        ? Math.round(value * 10) === value * 10
        : Number.isInteger(value))
    );
  }

  function validateBackup(backup) {
    if (!isObject(backup)) {
      throw new TypeError("Файлът не съдържа валиден архив за Healthy Life Tracker.");
    }
    if (backup.version !== 2) {
      throw new TypeError("Версията на архива не се поддържа.");
    }
    if (
      Object.keys(backup).some((field) => !backupFields.includes(field)) ||
      !Object.hasOwn(backup, "records") ||
      !Object.hasOwn(backup, "goals")
    ) {
      throw new TypeError("Архивът няма задължителните данни за записи и цели.");
    }
    if (!isObject(backup.records) || !isObject(backup.goals)) {
      throw new TypeError("Записите и целите в архива са невалидни.");
    }

    if (
      Object.keys(backup.goals).length !== habitNames.length ||
      habitNames.some(
        (habit) =>
          !Object.hasOwn(backup.goals, habit) ||
          !isValidHabitValue(backup.goals[habit], habit, false),
      )
    ) {
      throw new TypeError("Архивът съдържа невалидни или липсващи дневни цели.");
    }

    for (const [dateKey, entry] of Object.entries(backup.records)) {
      if (!isValidDateKey(dateKey) || !isObject(entry)) {
        throw new TypeError("Архивът съдържа невалидна дата или запис.");
      }

      const recordedHabits = Object.keys(entry);
      if (
        recordedHabits.length === 0 ||
        recordedHabits.some(
          (habit) =>
            !Object.hasOwn(habitDefinitions, habit) ||
            !isValidHabitValue(entry[habit], habit, true),
        )
      ) {
        throw new TypeError("Архивът съдържа невалидни стойности за навиците.");
      }
    }

    return backup;
  }

  function createBackupXml(data) {
    const backup = validateBackup(data);
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<healthyLifeTrackerBackup version="2">',
      "  <records>",
    ];

    for (const dateKey of Object.keys(backup.records).sort()) {
      lines.push(`    <record date="${dateKey}">`);
      for (const habit of habitNames) {
        if (Object.hasOwn(backup.records[dateKey], habit)) {
          lines.push(`      <${habit}>${backup.records[dateKey][habit]}</${habit}>`);
        }
      }
      lines.push("    </record>");
    }

    lines.push("  </records>", "  <goals>");
    for (const habit of habitNames) {
      lines.push(`    <${habit}>${backup.goals[habit]}</${habit}>`);
    }
    lines.push("  </goals>", "</healthyLifeTrackerBackup>");
    return lines.join("\n");
  }

  function getElementChildren(element, expectedNames = null) {
    const children = [];
    for (const node of element.childNodes) {
      if (node.nodeType === 1) {
        children.push(node);
      } else if (node.nodeType !== 3 || node.textContent.trim() !== "") {
        throw new TypeError("XML архивът съдържа неочаквани данни.");
      }
    }

    if (
      expectedNames !== null &&
      (children.length !== expectedNames.length ||
        children.some((child, index) => child.nodeName !== expectedNames[index]))
    ) {
      throw new TypeError("XML архивът съдържа липсващи или неподдържани полета.");
    }
    return children;
  }

  function readNumberElement(element) {
    if (
      element.attributes.length !== 0 ||
      [...element.childNodes].some((node) => node.nodeType !== 3)
    ) {
      throw new TypeError("XML архивът съдържа невалидна числова стойност.");
    }

    const rawValue = element.textContent.trim();
    if (rawValue === "") throw new TypeError("XML архивът съдържа празна числова стойност.");
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new TypeError("XML архивът съдържа невалидна числова стойност.");
    return value;
  }

  function parseBackupXml(contents) {
    if (typeof contents !== "string" || contents.trim() === "") {
      throw new TypeError("Файлът е празен.");
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(contents)) {
      throw new TypeError("XML архивът не може да съдържа DTD или външни entities.");
    }
    if (typeof global.DOMParser !== "function") {
      throw new Error("Този браузър не поддържа четене на XML файлове.");
    }

    const document = new global.DOMParser().parseFromString(contents, "application/xml");
    const root = document.documentElement;
    if (
      !root ||
      root.nodeName !== "healthyLifeTrackerBackup" ||
      root.namespaceURI ||
      document.getElementsByTagName("parsererror").length > 0
    ) {
      throw new TypeError("Файлът не съдържа валиден XML архив.");
    }
    if (root.attributes.length !== 1 || root.getAttribute("version") !== "2") {
      throw new TypeError("Версията или форматът на XML архива не се поддържа.");
    }
    if (
      [...document.childNodes].some(
        (node) =>
          node !== root &&
          (node.nodeType !== 8 && (node.nodeType !== 3 || node.textContent.trim() !== "")),
      )
    ) {
      throw new TypeError("XML архивът съдържа неочаквани данни.");
    }

    const [recordsElement, goalsElement] = getElementChildren(root, ["records", "goals"]);
    if (recordsElement.attributes.length !== 0 || goalsElement.attributes.length !== 0) {
      throw new TypeError("XML архивът съдържа неподдържани атрибути.");
    }

    const records = {};
    for (const recordElement of getElementChildren(recordsElement)) {
      if (
        recordElement.nodeName !== "record" ||
        recordElement.attributes.length !== 1 ||
        !recordElement.hasAttribute("date")
      ) {
        throw new TypeError("XML архивът съдържа невалиден запис.");
      }

      const dateKey = recordElement.getAttribute("date");
      if (Object.hasOwn(records, dateKey)) {
        throw new TypeError("XML архивът съдържа повторена дата.");
      }
      const entry = {};
      for (const habitElement of getElementChildren(recordElement)) {
        if (!Object.hasOwn(habitDefinitions, habitElement.nodeName)) {
          throw new TypeError("XML архивът съдържа неподдържан навик.");
        }
        if (Object.hasOwn(entry, habitElement.nodeName)) {
          throw new TypeError("XML архивът съдържа повторен навик.");
        }
        entry[habitElement.nodeName] = readNumberElement(habitElement);
      }
      records[dateKey] = entry;
    }

    const goals = {};
    for (const goalElement of getElementChildren(goalsElement, habitNames)) {
      goals[goalElement.nodeName] = readNumberElement(goalElement);
    }

    return validateBackup({ version: 2, records, goals });
  }

  function importBackup(storage, storageKey, backup, confirmReplacement) {
    const validatedBackup = validateBackup(backup);
    if (typeof confirmReplacement !== "function") {
      throw new TypeError("Не може да бъде потвърдено заместването на данните.");
    }
    if (!confirmReplacement()) return { imported: false };

    storage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        records: validatedBackup.records,
        goals: validatedBackup.goals,
      }),
    );
    return { imported: true, data: validatedBackup };
  }

  global.HealthyLifeBackup = Object.freeze({
    createBackupXml,
    importBackup,
    parseBackupXml,
    validateBackup,
  });
})(globalThis);

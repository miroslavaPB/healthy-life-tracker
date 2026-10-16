(function registerHabitAnalysis(global) {
  const habitOrder = ["water", "sleep", "exercise"];

  function isValidDateKey(dateKey) {
    if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey;
  }

  function shiftDateKey(dateKey, days) {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isValidHabitValue(value, definition) {
    return (
      Number.isFinite(value) &&
      value >= 0 &&
      value <= definition.max &&
      (definition.decimals > 0 || Number.isInteger(value))
    );
  }

  function analyzeHabitRecords(records, goals, period, todayKey, definitions) {
    if (!["7", "30", "all"].includes(period)) {
      throw new RangeError(`Unsupported coach period: ${period}`);
    }
    if (!isValidDateKey(todayKey)) {
      throw new TypeError("The coach requires a valid local date key.");
    }

    const startDate = period === "all" ? null : shiftDateKey(todayKey, 1 - Number(period));
    const dateKeys = Object.keys(records)
      .filter((dateKey) => {
        if (!isValidDateKey(dateKey)) return false;
        if (startDate && dateKey < startDate) return false;
        return period === "all" || dateKey <= todayKey;
      })
      .sort();
    const usableRecords = dateKeys.map((dateKey) => [dateKey, records[dateKey]]);
    const metrics = Object.fromEntries(
      habitOrder.map((habit) => {
        const definition = definitions[habit];
        const entries = usableRecords.flatMap(([date, record]) => {
          const value = record && typeof record === "object" ? record[habit] : undefined;
          return isValidHabitValue(value, definition) ? [{ date, value }] : [];
        });
        const total = entries.reduce((sum, entry) => sum + entry.value, 0);
        const goal = Number.isFinite(goals[habit]) && goals[habit] > 0 ? goals[habit] : null;
        const average = entries.length > 0 ? total / entries.length : null;
        const minimum = entries.length > 0 ? Math.min(...entries.map(({ value }) => value)) : null;
        const maximum = entries.length > 0 ? Math.max(...entries.map(({ value }) => value)) : null;
        const pattern =
          entries.length < 3
            ? null
            : {
                minimum,
                maximum,
                average,
                goalStatus:
                  goal === null ? null : average >= goal ? "at-or-above" : "below",
              };

        return [
          habit,
          {
            count: entries.length,
            average,
            minimum,
            maximum,
            goal,
            goalMetCount:
              goal === null ? null : entries.filter(({ value }) => value >= goal).length,
            pattern,
          },
        ];
      }),
    );
    const daysWithRecords = usableRecords.filter(([, record]) =>
      habitOrder.some((habit) => {
        const value = record && typeof record === "object" ? record[habit] : undefined;
        return isValidHabitValue(value, definitions[habit]);
      }),
    ).length;

    return { period, dateCount: dateKeys.length, daysWithRecords, metrics };
  }

  global.HabitAnalysis = Object.freeze({ analyzeHabitRecords });
})(globalThis);

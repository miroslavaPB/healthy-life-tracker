const STORAGE_KEY = "dailywell-tracker-v2";
const LEGACY_STORAGE_KEY = "dailywell-tracker-v1";

const habitDefinitions = {
  water: { label: "Вода", unit: "мл", goal: 2000, max: 10000, decimals: 0, color: "#2caaa7" },
  sleep: { label: "Сън", unit: "ч", goal: 8, max: 24, decimals: 1, color: "#7ca7d9" },
  exercise: { label: "Движение", unit: "мин", goal: 30, max: 1440, decimals: 0, color: "#e98e78" },
};

const defaultGoals = Object.fromEntries(
  Object.entries(habitDefinitions).map(([habit, definition]) => [habit, definition.goal]),
);
const goals = { ...defaultGoals };
let records = {};
let selectedDate = getLocalDateKey(new Date());
let reportAnchor = selectedDate;
let reportPeriod = "week";
let reportChartData = {};
let chartActiveIndexes = { water: 0, sleep: 0, exercise: 0 };
let storageCanWrite = true;
let dailyQuotes = [];
let quoteTimer = null;
let quoteRefreshInterval = null;
let displayedQuoteDate = "";
let displayedTimeZoneOffset = null;

const datePicker = document.querySelector("#date-picker");
const storageMessage = document.querySelector("#storage-message");
const deleteDialog = document.querySelector("#delete-dialog");
const numberFormatter = new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 1 });

function renderDailyQuote(date = new Date()) {
  const quote = DailyQuoteSelection.selectQuoteForDate(
    date,
    dailyQuotes,
    DailyQuoteSelection.fallbackQuote,
  );
  const quoteDate = getLocalDateKey(date);

  document.querySelector("#quote-text-bg").textContent = quote.bg.text;
  document.querySelector("#quote-author-bg").textContent = quote.bg.author;
  document.querySelector("#quote-date").textContent = formatDate(quoteDate);
  displayedQuoteDate = quoteDate;
  displayedTimeZoneOffset = date.getTimezoneOffset();
}

function scheduleNextQuoteRefresh() {
  window.clearTimeout(quoteTimer);
  const now = new Date();
  const nextLocalMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    100,
  );
  const delay = Math.max(0, nextLocalMidnight.getTime() - now.getTime());

  quoteTimer = window.setTimeout(() => {
    renderDailyQuote();
    scheduleNextQuoteRefresh();
  }, delay);
}

function refreshDailyQuote() {
  const now = new Date();
  if (
    getLocalDateKey(now) !== displayedQuoteDate ||
    now.getTimezoneOffset() !== displayedTimeZoneOffset
  ) {
    renderDailyQuote(now);
  }
  scheduleNextQuoteRefresh();
}

async function loadDailyQuotes() {
  const status = document.querySelector("#quote-status");
  try {
    const response = await fetch(new URL("quotes.json", document.baseURI));
    if (!response.ok) throw new Error(`Quote file returned HTTP ${response.status}.`);

    const quoteFile = await response.json();
    if (!Array.isArray(quoteFile)) {
      throw new Error("Quote file must contain a JSON array.");
    }

    dailyQuotes = quoteFile.filter(DailyQuoteSelection.isValidQuote);
    if (dailyQuotes.length === 0) {
      status.textContent = "Списъкът с цитати е празен или невалиден.";
    } else if (dailyQuotes.length < quoteFile.length) {
      status.textContent = "Някои цитати не са валидни и бяха пропуснати.";
    }
  } catch {
    dailyQuotes = [];
    status.textContent = "Цитатите не могат да бъдат заредени.";
  }

  renderDailyQuote();
}

function startDailyQuote() {
  renderDailyQuote();
  void loadDailyQuotes();
  scheduleNextQuoteRefresh();

  if (quoteRefreshInterval !== null) window.clearInterval(quoteRefreshInterval);
  quoteRefreshInterval = window.setInterval(refreshDailyQuote, 60_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDailyQuote();
  });
  window.addEventListener("focus", refreshDailyQuote);
  window.addEventListener("pageshow", refreshDailyQuote);
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return getLocalDateKey(date) === dateKey ? date : null;
}

function shiftDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  if (!date) return getLocalDateKey(new Date());
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}

function formatDate(dateKey, options = { day: "numeric", month: "long", year: "numeric" }) {
  const date = parseDateKey(dateKey);
  return date ? new Intl.DateTimeFormat("bg-BG", options).format(date) : dateKey;
}

function setStorageMessage(message, isError = false) {
  storageMessage.textContent = message;
  storageMessage.classList.toggle("error-message", isError);
}

function isValidValue(value, habit) {
  const definition = habitDefinitions[habit];
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= definition.max &&
    (definition.decimals > 0 || Number.isInteger(value))
  );
}

function sanitizeRecords(source) {
  const cleaned = {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return cleaned;

  for (const [dateKey, entry] of Object.entries(source)) {
    if (!parseDateKey(dateKey) || !entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const validEntry = {};
    for (const habit of Object.keys(habitDefinitions)) {
      if (isValidValue(entry[habit], habit)) validEntry[habit] = entry[habit];
    }
    if (Object.keys(validEntry).length > 0) cleaned[dateKey] = validEntry;
  }
  return cleaned;
}

function loadRecords() {
  let currentData = null;
  let legacyData = null;
  let currentIsCorrupt = false;

  try {
    const rawCurrent = localStorage.getItem(STORAGE_KEY);
    if (rawCurrent !== null) {
      try {
        currentData = JSON.parse(rawCurrent);
      } catch {
        currentIsCorrupt = true;
      }
    }
  } catch {
    storageCanWrite = false;
    setStorageMessage("Не успяхме да прочетем запазените данни от този браузър.", true);
    return;
  }

  if (currentIsCorrupt) {
    storageCanWrite = false;
    setStorageMessage(
      "Новият запис за данни не може да бъде прочетен. Старите записи са запазени и няма да бъдат презаписани.",
      true,
    );
    return;
  }

  if (currentData !== null) {
    if (
      typeof currentData !== "object" ||
      Array.isArray(currentData) ||
      currentData.version !== 2 ||
      !currentData.records ||
      typeof currentData.records !== "object" ||
      Array.isArray(currentData.records)
    ) {
      storageCanWrite = false;
      setStorageMessage(
        "Форматът на запазените записи не е разпознат. Данните в браузъра не са променени.",
        true,
      );
      return;
    }
    records = sanitizeRecords(currentData.records);
    loadGoals(currentData.goals);
    return;
  }

  try {
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawLegacy !== null) legacyData = JSON.parse(rawLegacy);
  } catch {
    setStorageMessage(
      "Старите записи не могат да бъдат прочетени. Оригиналните данни са запазени.",
      true,
    );
    return;
  }

  if (legacyData !== null) {
    records = sanitizeRecords(legacyData);
    if (Object.keys(records).length > 0) {
      if (saveAllData()) {
        setStorageMessage("Старите ти записи бяха прехвърлени безопасно.");
      }
    }
  }
}

function loadGoals(savedGoals) {
  if (!savedGoals || typeof savedGoals !== "object" || Array.isArray(savedGoals)) return;
  for (const habit of Object.keys(habitDefinitions)) {
    const value = savedGoals[habit];
    if (Number.isFinite(value) && value > 0 && value <= habitDefinitions[habit].max) {
      goals[habit] = value;
    }
  }
}

function saveAllData() {
  if (!storageCanWrite) {
    setStorageMessage(
      "Данните не са променени, за да запазим съществуващия файл с записи.",
      true,
    );
    return false;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, records, goals }),
    );
    return true;
  } catch {
    setStorageMessage(
      "Не успяхме да запазим промените. Провери дали браузърът разрешава локално съхранение.",
      true,
    );
    return false;
  }
}

function formatNumber(value, decimals = 1) {
  return numberFormatter.format(Number(value.toFixed(decimals)));
}

function formatHabitValue(value, habit) {
  const definition = habitDefinitions[habit];
  return `${formatNumber(value, definition.decimals)} ${definition.unit}`;
}

function getSelectedRecord() {
  return records[selectedDate] || null;
}

function hasRecordForDate(dateKey) {
  return Boolean(records[dateKey] && Object.keys(records[dateKey]).length > 0);
}

function renderSelectedDate() {
  const record = getSelectedRecord();
  datePicker.value = selectedDate;
  document.querySelector("#selected-date-label").textContent =
    formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const status = document.querySelector("#record-status");
  status.textContent = record ? "Има запис за тази дата" : "Все още няма запис за тази дата";
  status.classList.toggle("has-record", Boolean(record));
  document.querySelector("#delete-day").hidden = !record;

  for (const habit of Object.keys(habitDefinitions)) {
    renderHabit(habit, record);
  }
  renderDailySummary(record);
}

function renderHabit(habit, record = getSelectedRecord()) {
  const definition = habitDefinitions[habit];
  const value = record?.[habit];
  const progress = document.querySelector(`#${habit}-progress`);
  const percentage = value === undefined ? null : Math.min((value / goals[habit]) * 100, 100);
  const roundedPercentage = percentage === null ? 0 : Math.round(percentage);

  document.querySelector(`#${habit}-progress-text`).textContent =
    value === undefined ? "Няма въведени данни" : formatHabitValue(value, habit);
  document.querySelector(`#${habit}-progress-percent`).textContent =
    percentage === null ? "—" : `${roundedPercentage}%`;
  progress.setAttribute("aria-valuenow", String(roundedPercentage));
  progress.setAttribute(
    "aria-valuetext",
    percentage === null ? "Няма въведени данни" : `${roundedPercentage}% от целта`,
  );
  progress.querySelector(".progress-fill").style.width = `${percentage || 0}%`;

  const encouragement = document.querySelector(`#${habit}-encouragement`);
  encouragement.textContent =
    value === undefined
      ? ""
      : value >= goals[habit]
        ? "Чудесно! Достигна своята цел."
        : "Всяка малка стъпка е напредък.";
  document.querySelector(`#${habit}-input`).value = value === undefined ? "" : String(value);
  document.querySelector(`#${habit}-goal-label`).textContent =
    `${formatNumber(goals[habit], definition.decimals)} ${definition.unit}`;
  document.querySelector(`#${habit}-goal-input`).value = String(goals[habit]);
}

function renderDailySummary(record) {
  const complete = Object.keys(habitDefinitions).filter(
    (habit) => record?.[habit] !== undefined && record[habit] >= goals[habit],
  ).length;
  document.querySelector("#completed-count").textContent = String(complete);
  document.querySelector("#daily-score").setAttribute(
    "aria-label",
    `${complete} от 3 изпълнени цели`,
  );

  const messages = [
    "Всяка малка стъпка има значение. Избери един навик и започни.",
    "Добро начало! Продължи със свое собствено темпо.",
    "Виж колко добре се грижиш за себе си. Продължавай!",
    "Трите цели са постигнати. Поздрави се за грижата!",
  ];
  document.querySelector("#daily-message").textContent = messages[complete];
}

function showError(input, errorElement, message) {
  input.setAttribute("aria-invalid", "true");
  errorElement.textContent = message;
}

function clearError(input, errorElement) {
  input.removeAttribute("aria-invalid");
  errorElement.textContent = "";
}

function validateValue(habit, input, errorElement) {
  const definition = habitDefinitions[habit];
  const rawValue = input.value.trim();
  const value = Number(rawValue);

  if (rawValue === "") {
    showError(input, errorElement, `Въведи стойност за ${definition.label.toLowerCase()}.`);
    return null;
  }
  if (!Number.isFinite(value)) {
    showError(input, errorElement, "Въведи валидно число.");
    return null;
  }
  if (value < 0) {
    showError(input, errorElement, "Стойността не може да бъде отрицателна.");
    return null;
  }
  if (value > definition.max) {
    showError(input, errorElement, `Въведи стойност до ${definition.max}.`);
    return null;
  }
  if (definition.decimals === 0 && !Number.isInteger(value)) {
    showError(input, errorElement, "Моля, въведи цяло число.");
    return null;
  }
  if (definition.decimals === 1 && Math.round(value * 10) !== value * 10) {
    showError(input, errorElement, "Въведи най-много един знак след десетичната запетая.");
    return null;
  }
  clearError(input, errorElement);
  return value;
}

function saveHabit(habit, input, errorElement) {
  const value = validateValue(habit, input, errorElement);
  if (value === null) {
    input.focus();
    return;
  }

  const previousRecord = records[selectedDate];
  records[selectedDate] = { ...(previousRecord || {}), [habit]: value };
  if (!saveAllData()) {
    if (previousRecord) records[selectedDate] = previousRecord;
    else delete records[selectedDate];
    renderSelectedDate();
    return;
  }
  setStorageMessage("Записът е запазен на това устройство.");
  renderSelectedDate();
  renderReport();
}

function validateGoal(habit, input, errorElement) {
  const definition = habitDefinitions[habit];
  const rawValue = input.value.trim();
  const value = Number(rawValue);

  if (rawValue === "" || !Number.isFinite(value) || value <= 0) {
    showError(input, errorElement, "Целта трябва да бъде число, по-голямо от нула.");
    return null;
  }
  if (value > definition.max) {
    showError(input, errorElement, `Целта не може да бъде над ${definition.max} ${definition.unit}.`);
    return null;
  }
  if (definition.decimals === 0 && !Number.isInteger(value)) {
    showError(input, errorElement, "Моля, въведи цяло число.");
    return null;
  }
  if (definition.decimals === 1 && Math.round(value * 10) !== value * 10) {
    showError(input, errorElement, "Въведи най-много един знак след десетичната запетая.");
    return null;
  }
  clearError(input, errorElement);
  return value;
}

function saveGoal(habit, input, errorElement) {
  const value = validateGoal(habit, input, errorElement);
  if (value === null) {
    input.focus();
    return;
  }

  const previousGoal = goals[habit];
  goals[habit] = value;
  if (!saveAllData()) {
    goals[habit] = previousGoal;
    renderSelectedDate();
    return;
  }
  setStorageMessage("Дневната цел е обновена.");
  renderSelectedDate();
  renderReport();
}

function getWeekDays(anchorKey) {
  const anchor = parseDateKey(anchorKey);
  const offset = (anchor.getDay() + 6) % 7;
  const monday = shiftDays(anchorKey, -offset);
  return Array.from({ length: 7 }, (_, index) => shiftDays(monday, index));
}

function getMonthDays(anchorKey) {
  const date = parseDateKey(anchorKey);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) =>
    getLocalDateKey(new Date(date.getFullYear(), date.getMonth(), index + 1)),
  );
}

function getYearMonths(anchorKey) {
  const year = parseDateKey(anchorKey).getFullYear();
  return Array.from({ length: 12 }, (_, month) => ({
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    days: Array.from(
      { length: new Date(year, month + 1, 0).getDate() },
      (_, day) => getLocalDateKey(new Date(year, month, day + 1)),
    ),
  }));
}

function getPeriodData() {
  if (reportPeriod === "week") {
    const days = getWeekDays(reportAnchor);
    return {
      dates: days,
      label: `${formatDate(days[0], { day: "numeric", month: "short" })} – ${formatDate(days[6], { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }
  if (reportPeriod === "month") {
    const date = parseDateKey(reportAnchor);
    return {
      dates: getMonthDays(reportAnchor),
      label: new Intl.DateTimeFormat("bg-BG", { month: "long", year: "numeric" }).format(date),
    };
  }
  const months = getYearMonths(reportAnchor);
  return {
    months,
    dates: months.flatMap((month) => month.days),
    label: String(parseDateKey(reportAnchor).getFullYear()),
  };
}

function getStats(dateKeys) {
  const summary = {};
  for (const habit of Object.keys(habitDefinitions)) {
    const entries = dateKeys
      .map((dateKey) => records[dateKey]?.[habit])
      .filter((value) => value !== undefined);
    const total = entries.reduce((sum, value) => sum + value, 0);
    summary[habit] = {
      total,
      average: entries.length > 0 ? total / entries.length : null,
      count: entries.length,
    };
  }
  summary.days = new Set(
    dateKeys.filter((dateKey) => hasRecordForDate(dateKey)),
  ).size;
  return summary;
}

function getMonthlyValues(days, habit) {
  const entries = days
    .map((dateKey) => records[dateKey]?.[habit])
    .filter((value) => value !== undefined);
  return {
    total: entries.reduce((sum, value) => sum + value, 0),
    average: entries.length > 0
      ? entries.reduce((sum, value) => sum + value, 0) / entries.length
      : null,
    count: entries.length,
  };
}

function formatStatistic(value, habit) {
  if (value === null) return "—";
  return formatHabitValue(value, habit);
}

function formatRecordedDays(count) {
  return count === 1 ? "1 ден с данни" : `${count} дни с данни`;
}

function formatAverage(value, habit) {
  if (value === null) return "—";
  return `${formatNumber(value, 1)} ${habitDefinitions[habit].unit}`;
}

function createCoachElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderCoachEmptyState() {
  const results = document.querySelector("#coach-results");
  results.replaceChildren(
    createCoachElement("h3", "", "Няма данни за този период"),
    createCoachElement(
      "p",
      "",
      "В избрания период няма валидни записани стойности. Записите ти остават запазени и можеш да опиташ друг период.",
    ),
  );
}

function renderCoachAnalysis(analysis) {
  const results = document.querySelector("#coach-results");
  const periodLabel = {
    "7": "последните 7 дни",
    "30": "последните 30 дни",
    all: "всички налични записи",
  }[analysis.period];
  const summary = document.createElement("section");
  summary.append(
    createCoachElement("h3", "", "Обобщение"),
    createCoachElement(
      "p",
      "",
      `За ${periodLabel} има ${analysis.daysWithRecords} ${
        analysis.daysWithRecords === 1 ? "ден със запис" : "дни със записи"
      }. Броят се само валидните записани стойности; липсващите дни и показатели не се приемат за нула.`,
    ),
  );

  const metricGrid = document.createElement("div");
  metricGrid.className = "coach-metrics";
  for (const habit of Object.keys(habitDefinitions)) {
    const definition = habitDefinitions[habit];
    const metric = analysis.metrics[habit];
    const card = document.createElement("article");
    card.className = `coach-metric coach-metric-${habit}`;
    card.append(
      createCoachElement("h4", "", definition.label),
      createCoachElement(
        "p",
        "coach-metric-count",
        `Валидни стойности: ${metric.count}`,
      ),
    );
    if (metric.count > 0) {
      card.append(
        createCoachElement(
          "p",
          "",
          `Средно: ${formatAverage(metric.average, habit)}.`,
        ),
      );
      if (metric.goal !== null) {
        const goalLabel =
          metric.goal === defaultGoals[habit]
            ? "цел по подразбиране на приложението"
            : "запазена цел";
        const averageComparison =
          metric.average >= metric.goal ? "достига или надвишава" : "е под";
        card.append(
          createCoachElement(
            "p",
            "",
            `Цел (${goalLabel}): ${formatHabitValue(metric.goal, habit)}. Средното ${averageComparison} целта; ${metric.goalMetCount} от ${metric.count} записа я достигат.`,
          ),
        );
      }
    } else {
      card.append(createCoachElement("p", "", "Няма стойности за този показател."));
    }
    metricGrid.append(card);
  }
  summary.append(metricGrid);

  const patterns = document.createElement("section");
  patterns.append(createCoachElement("h3", "", "Наблюдавани модели"));
  const patternList = document.createElement("ul");
  for (const habit of Object.keys(habitDefinitions)) {
    const definition = habitDefinitions[habit];
    const metric = analysis.metrics[habit];
    const text =
      metric.pattern === null
        ? `${definition.label}: недостатъчно данни за смислен модел (има ${metric.count} от нужните поне 3 валидни записа).`
        : `${definition.label}: ${metric.count} записа са в диапазона ${formatHabitValue(
            metric.pattern.minimum,
            habit,
          )}–${formatHabitValue(metric.pattern.maximum, habit)}; средната стойност ${
            metric.pattern.goalStatus === "at-or-above"
              ? "достига или надвишава"
              : "е под"
          } ${metric.goal === null ? "сравнима цел не е зададена" : `целта ${formatHabitValue(metric.goal, habit)}`}.`;
    patternList.append(createCoachElement("li", "", text));
  }
  patterns.append(patternList);

  const recommendations = [];
  for (const habit of Object.keys(habitDefinitions)) {
    const definition = habitDefinitions[habit];
    const metric = analysis.metrics[habit];
    if (metric.pattern?.goalStatus !== "below") continue;
    const suggestions = {
      water: `Опитай да свържеш чаша вода с ежедневна рутина, която вече имаш, и продължи да записваш приетото количество.`,
      sleep: `Ако ти е удобно, избери спокоен и постоянен час за подготовка за сън и продължи да записваш часовете си.`,
      exercise: `Планирай кратка разходка или друго приятно за теб движение и отбележи минутите, когато ти е удобно.`,
    };
    recommendations.push(`${definition.label}: ${suggestions[habit]}`);
  }
  if (recommendations.length === 0) {
    const hasSparseMetric = Object.values(analysis.metrics).some((metric) => metric.pattern === null);
    recommendations.push(
      hasSparseMetric
        ? "За по-полезно обобщение, опитай да записваш избраните навици по няколко пъти през периода. Пропуснатите дни остават неизвестни."
        : "Продължи да записваш навиците си в удобен за теб ритъм и избирай малки стъпки, които ти пасват.",
    );
  }
  const recommendationSection = document.createElement("section");
  recommendationSection.append(
    createCoachElement("h3", "", "Практични идеи"),
  );
  const recommendationList = document.createElement("ul");
  for (const recommendation of recommendations.slice(0, 3)) {
    recommendationList.append(createCoachElement("li", "", recommendation));
  }
  recommendationSection.append(recommendationList);

  results.replaceChildren(
    summary,
    patterns,
    recommendationSection,
    createCoachElement(
      "p",
      "coach-data-note",
      "Това е локален анализ на записаните стойности, а не разговор с генеративен AI. Целите, които съвпадат с началните стойности, са обозначени като цели по подразбиране.",
    ),
  );
}

async function analyzeHabits() {
  const button = document.querySelector("#analyze-habits");
  const results = document.querySelector("#coach-results");
  button.disabled = true;
  button.textContent = "Анализирам...";
  results.setAttribute("aria-busy", "true");
  results.replaceChildren(createCoachElement("p", "coach-loading", "Анализирам записите ти локално…"));

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const analysis = HabitAnalysis.analyzeHabitRecords(
      records,
      goals,
      document.querySelector("#coach-period").value,
      getLocalDateKey(new Date()),
      habitDefinitions,
    );
    if (analysis.daysWithRecords === 0) renderCoachEmptyState();
    else renderCoachAnalysis(analysis);
  } catch (error) {
    console.error("Healthy Habit Coach analysis failed.", error);
    results.replaceChildren(
      createCoachElement("h3", "", "Неуспешен анализ"),
      createCoachElement(
        "p",
        "coach-error",
        `Не успяхме да анализираме записите локално: ${
          error instanceof Error ? error.message : "възникна неизвестна грешка"
        }`,
      ),
    );
  } finally {
    button.disabled = false;
    button.textContent = "Анализирай навиците ми";
    results.setAttribute("aria-busy", "false");
  }
}

function renderStats(dateKeys) {
  const summary = getStats(dateKeys);
  const cards = [
    `<article class="stat-card"><span>Дни със запис</span><strong>${summary.days}</strong><small>от ${dateKeys.length} дни</small></article>`,
    ...Object.keys(habitDefinitions).map((habit) => {
      const definition = habitDefinitions[habit];
      const item = summary[habit];
      return `<article class="stat-card"><span>${definition.label} · общо</span><strong>${formatStatistic(item.count > 0 ? item.total : null, habit)}</strong><small>средно ${formatAverage(item.average, habit)} · ${formatRecordedDays(item.count)}</small></article>`;
    }),
  ];
  document.querySelector("#report-stats").innerHTML = cards.join("");
}

function renderDailyTable(dateKeys, includeProgress = false) {
  const rows = dateKeys.map((dateKey) => {
    const entry = records[dateKey];
    const values = Object.keys(habitDefinitions).map((habit) => {
      const value = entry?.[habit];
      const content = value === undefined ? "—" : formatHabitValue(value, habit);
      const style = value === undefined ? "missing-value" : "recorded-value";
      return `<td class="${style}">${content}</td>`;
    });
    const progress = includeProgress
      ? `<td>${entry ? `${Object.keys(habitDefinitions).filter((habit) => entry[habit] !== undefined && entry[habit] >= goals[habit]).length} / 3` : "—"}</td>`
      : "";
    const dayName = formatDate(dateKey, { weekday: "short" });
    return `<tr><td>${dayName}, ${formatDate(dateKey, { day: "2-digit", month: "2-digit" })}</td>${values.join("")}${progress}</tr>`;
  });
  const progressHeader = includeProgress ? "<th scope=\"col\">Достигнати цели (от 3)</th>" : "";
  return `
    <div class="table-wrap" id="report-table-wrap">
      <table class="report-table">
        <thead><tr><th scope="col">Дата</th><th scope="col">Вода</th><th scope="col">Сън</th><th scope="col">Движение</th>${progressHeader}</tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;
}

function renderYearTable(months) {
  const rows = months.map(({ key, days }) => {
    const date = parseDateKey(`${key}-01`);
    const monthlyStats = Object.fromEntries(
      Object.keys(habitDefinitions).map((habit) => [habit, getMonthlyValues(days, habit)]),
    );
    const monthRecordDays = new Set(days.filter(hasRecordForDate)).size;
    const values = Object.keys(habitDefinitions)
      .map((habit) => {
        const stat = monthlyStats[habit];
        return `<td class="${stat.count ? "recorded-value" : "missing-value"}">${stat.count ? `${formatHabitValue(stat.total, habit)} · ${formatAverage(stat.average, habit)}/ден` : "—"}</td>`;
      })
      .join("");
    return `<tr><td>${new Intl.DateTimeFormat("bg-BG", { month: "long" }).format(date)}</td>${values}<td>${monthRecordDays}</td></tr>`;
  });
  return `
    <div class="table-wrap" id="report-table-wrap">
      <table class="report-table">
        <thead><tr><th scope="col">Месец</th><th scope="col">Вода · общо / ден</th><th scope="col">Сън · общо / нощ</th><th scope="col">Движение · общо / ден</th><th scope="col">Дни със запис</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;
}

function buildChartSeries(habit, periodData) {
  if (reportPeriod !== "year") {
    return {
      labels: periodData.dates.map((dateKey) =>
        reportPeriod === "week"
          ? formatDate(dateKey, { weekday: "short", day: "numeric" })
          : formatDate(dateKey, { day: "numeric" }),
      ),
      values: periodData.dates.map((dateKey) => records[dateKey]?.[habit] ?? null),
      goal: goals[habit],
      unit: habitDefinitions[habit].unit,
      decimals: reportPeriod === "year" ? 1 : habitDefinitions[habit].decimals,
      daily: true,
    };
  }

  return {
    labels: periodData.months.map(({ key }) =>
      new Intl.DateTimeFormat("bg-BG", { month: "short" }).format(parseDateKey(`${key}-01`)),
    ),
    values: periodData.months.map(({ days }) => getMonthlyValues(days, habit).average),
    goal: goals[habit],
    unit: habitDefinitions[habit].unit,
    decimals: 1,
    daily: false,
  };
}

function drawChart(habit, series) {
  const canvas = document.querySelector(`#${habit}-chart`);
  const card = canvas.closest(".chart-card");
  const tooltip = document.querySelector(`#${habit}-chart-tooltip`);
  const context = canvas.getContext("2d");
  const cssWidth = Math.max(260, canvas.clientWidth || 300);
  const cssHeight = canvas.clientHeight || 183;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const chart = { left: 44, right: cssWidth - 10, top: 13, bottom: cssHeight - 35 };
  const plotWidth = chart.right - chart.left;
  const plotHeight = chart.bottom - chart.top;
  const available = series.values.filter((value) => value !== null);
  const step = series.values.length > 21 ? Math.ceil(series.values.length / 14) : 1;

  context.font = "10px Trebuchet MS, Arial, sans-serif";
  context.textBaseline = "middle";
  context.strokeStyle = "#edf2ef";
  context.fillStyle = "#91a29b";
  context.lineWidth = 1;

  if (available.length === 0) {
    context.fillStyle = "#91a29b";
    context.textAlign = "center";
    context.fillText("Няма данни за този показател", cssWidth / 2, cssHeight / 2);
    card.classList.add("chart-no-data");
    reportChartData[habit] = { ...series, chart, cssWidth, cssHeight };
    return;
  }
  card.classList.remove("chart-no-data");

  const highestValue = Math.max(series.goal, ...available, 1);
  const max = highestValue * 1.2;
  for (let tick = 0; tick <= 4; tick += 1) {
    const y = chart.bottom - (plotHeight * tick) / 4;
    context.beginPath();
    context.moveTo(chart.left, y);
    context.lineTo(chart.right, y);
    context.stroke();
    context.textAlign = "right";
    context.fillStyle = "#91a29b";
    context.fillText(formatNumber((max * tick) / 4, series.decimals), chart.left - 6, y);
  }
  context.save();
  context.translate(10, chart.top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = "center";
  context.fillStyle = "#82948e";
  context.fillText(series.unit, 0, 0);
  context.restore();

  const goalY = chart.bottom - (series.goal / max) * plotHeight;
  context.save();
  context.setLineDash([4, 4]);
  context.strokeStyle = "#ed9a83";
  context.beginPath();
  context.moveTo(chart.left, goalY);
  context.lineTo(chart.right, goalY);
  context.stroke();
  context.restore();

  const slotWidth = plotWidth / series.values.length;
  const barWidth = Math.max(3, Math.min(22, slotWidth * 0.58));
  const colors = {
    water: "#37b3aa",
    sleep: "#83a9db",
    exercise: "#e9917b",
  };
  const points = [];
  series.values.forEach((value, index) => {
    const centerX = chart.left + slotWidth * (index + 0.5);
    const showLabel = series.values.length <= 14 || index % step === 0 || index === series.values.length - 1;
    if (showLabel) {
      context.fillStyle = "#879991";
      context.textAlign = "center";
      context.fillText(series.labels[index], centerX, chart.bottom + 17);
    }
    if (value === null) {
      points.push(null);
      return;
    }
    const y = chart.bottom - (value / max) * plotHeight;
    points.push({ x: centerX, y, index });
    context.fillStyle = colors[habit];
    if (value === 0) {
      context.beginPath();
      context.arc(centerX, chart.bottom - 1, 3, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.beginPath();
    context.roundRect(centerX - barWidth / 2, y, barWidth, chart.bottom - y, [
      Math.min(4, barWidth / 2),
      Math.min(4, barWidth / 2),
      0,
      0,
    ]);
    context.fill();
  });

  reportChartData[habit] = {
    ...series,
    chart,
    max,
    points,
    cssWidth,
    cssHeight,
  };
  if (tooltip.textContent.startsWith("Избери ден")) tooltip.textContent = "";
}

function renderCharts(periodData) {
  for (const habit of Object.keys(habitDefinitions)) {
    const series = buildChartSeries(habit, periodData);
    const subtitle = document.querySelector(`#${habit}-chart-subtitle`);
    subtitle.textContent = reportPeriod === "year"
      ? "Средно на ден по месеци"
      : habit === "sleep"
        ? "Часове на нощ"
        : habit === "water"
          ? "Прием на ден"
          : "Активност на ден";
    drawChart(habit, series);
  }
}

function renderReport() {
  const periodData = getPeriodData();
  document.querySelector("#period-label").textContent = periodData.label;
  document.querySelector("#report-panel").setAttribute(
    "aria-labelledby",
    `tab-${reportPeriod}`,
  );

  const daysWithData = periodData.dates.filter(hasRecordForDate);
  const emptyState = document.querySelector("#chart-empty-state");
  emptyState.hidden = daysWithData.length > 0;
  document.querySelector("#charts-grid").hidden = daysWithData.length === 0;
  if (daysWithData.length === 0) {
    document.querySelector("#report-stats").innerHTML = "";
    document.querySelector("#report-table-wrap").innerHTML = "";
    document.querySelector("#report-table-wrap").classList.remove("table-wrap");
    reportChartData = {};
    return;
  }

  document.querySelector("#report-table-wrap").classList.add("table-wrap");
  renderStats(periodData.dates);
  renderCharts(periodData);
  document.querySelector("#report-table-wrap").outerHTML =
    reportPeriod === "year"
      ? renderYearTable(periodData.months)
      : renderDailyTable(periodData.dates, reportPeriod === "week");
  attachChartInteractions();
}

function attachChartInteractions() {
  for (const habit of Object.keys(habitDefinitions)) {
    const canvas = document.querySelector(`#${habit}-chart`);
    canvas.onpointermove = (event) => {
      const data = reportChartData[habit];
      if (!data?.points) return;
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      let nearest = -1;
      let distance = Infinity;
      data.points.forEach((point, index) => {
        if (point && Math.abs(point.x - x) < distance) {
          nearest = index;
          distance = Math.abs(point.x - x);
        }
      });
      if (nearest >= 0 && distance <= 28) showChartTooltip(habit, nearest);
    };
    canvas.onpointerleave = () => {
      const tooltip = document.querySelector(`#${habit}-chart-tooltip`);
      tooltip.textContent = "";
    };
    canvas.onfocus = () => {
      const data = reportChartData[habit];
      if (!data?.values?.length) return;
      const firstRecorded = data.values.findIndex((value) => value !== null);
      chartActiveIndexes[habit] = firstRecorded < 0 ? 0 : firstRecorded;
      showChartTooltip(habit, chartActiveIndexes[habit]);
    };
    canvas.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const data = reportChartData[habit];
      if (!data?.values?.length) return;
      let index = chartActiveIndexes[habit] || 0;
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = data.values.length - 1;
      else index = Math.max(0, Math.min(data.values.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
      chartActiveIndexes[habit] = index;
      showChartTooltip(habit, index);
    };
  }
}

function showChartTooltip(habit, index) {
  const data = reportChartData[habit];
  if (!data || index < 0 || index >= data.values.length) return;
  const value = data.values[index];
  const tooltip = document.querySelector(`#${habit}-chart-tooltip`);
  const period = data.daily ? "ден" : "средно на ден";
  if (value === null) {
    tooltip.textContent = `Няма запис за ${data.labels[index]}.`;
  } else {
    tooltip.textContent =
      `${data.labels[index]} · ${formatNumber(value, data.decimals)} ${data.unit} (${period}; цел ${formatHabitValue(data.goal, habit)})`;
  }
  chartActiveIndexes[habit] = index;
}

function shiftReportPeriod(direction) {
  const date = parseDateKey(reportAnchor);
  if (reportPeriod === "week") {
    reportAnchor = shiftDays(reportAnchor, direction * 7);
  } else if (reportPeriod === "month") {
    reportAnchor = getLocalDateKey(new Date(date.getFullYear(), date.getMonth() + direction, 1));
  } else {
    reportAnchor = getLocalDateKey(new Date(date.getFullYear() + direction, 0, 1));
  }
  renderReport();
}

function setReportPeriod(period) {
  reportPeriod = period;
  for (const tab of document.querySelectorAll(".report-tabs [role='tab']")) {
    const isSelected = tab.dataset.period === period;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  }
  renderReport();
}

function changeSelectedDate(dateKey) {
  if (!parseDateKey(dateKey)) return;
  selectedDate = dateKey;
  reportAnchor = dateKey;
  renderSelectedDate();
  renderReport();
}

function deleteSelectedRecord() {
  if (!records[selectedDate]) return;
  const deletedRecord = records[selectedDate];
  delete records[selectedDate];
  if (!saveAllData()) {
    records[selectedDate] = deletedRecord;
    renderSelectedDate();
    return;
  }
  deleteDialog.close();
  setStorageMessage("Записът за избраната дата беше изтрит.");
  renderSelectedDate();
  renderReport();
}

function attachEventHandlers() {
  document.querySelector("#analyze-habits").addEventListener("click", analyzeHabits);
  document.querySelector("#previous-day").addEventListener("click", () => {
    changeSelectedDate(shiftDays(selectedDate, -1));
  });
  document.querySelector("#next-day").addEventListener("click", () => {
    changeSelectedDate(shiftDays(selectedDate, 1));
  });
  document.querySelector("#today-button").addEventListener("click", () => {
    changeSelectedDate(getLocalDateKey(new Date()));
  });
  datePicker.addEventListener("change", () => {
    if (parseDateKey(datePicker.value)) changeSelectedDate(datePicker.value);
    else datePicker.value = selectedDate;
  });
  document.querySelector("#previous-period").addEventListener("click", () => shiftReportPeriod(-1));
  document.querySelector("#next-period").addEventListener("click", () => shiftReportPeriod(1));

  for (const tab of document.querySelectorAll(".report-tabs [role='tab']")) {
    tab.addEventListener("click", () => setReportPeriod(tab.dataset.period));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll(".report-tabs [role='tab']")];
      const currentIndex = tabs.indexOf(tab);
      const nextIndex = (currentIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabs[nextIndex].focus();
      setReportPeriod(tabs[nextIndex].dataset.period);
    });
  }

  for (const habit of Object.keys(habitDefinitions)) {
    const form = document.querySelector(`form[data-habit="${habit}"]`);
    const input = form.elements.value;
    const errorElement = document.querySelector(`#${habit}-error`);
    input.addEventListener("input", () => clearError(input, errorElement));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveHabit(habit, input, errorElement);
    });

    const goalForm = document.querySelector(`form[data-goal="${habit}"]`);
    const goalInput = goalForm.querySelector("input");
    const goalError = document.querySelector(`#${habit}-goal-error`);
    goalInput.addEventListener("input", () => clearError(goalInput, goalError));
    goalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveGoal(habit, goalInput, goalError);
    });
  }

  document.querySelector("#delete-day").addEventListener("click", () => {
    document.querySelector("#delete-description").textContent =
      `Записите за ${formatDate(selectedDate)} ще бъдат премахнати. Това действие не може да бъде отменено.`;
    deleteDialog.showModal();
  });
  document.querySelector("#confirm-delete").addEventListener("click", (event) => {
    event.preventDefault();
    deleteSelectedRecord();
  });

  window.addEventListener("resize", () => {
    if (Object.keys(reportChartData).length > 0) renderReport();
  });

  for (const image of document.querySelectorAll(".habit-visual img")) {
    image.addEventListener("error", () => {
      image.closest(".habit-visual").classList.add("image-failed");
    });
  }
}

function startTracker() {
  loadRecords();
  attachEventHandlers();
  renderSelectedDate();
  renderReport();
  startDailyQuote();
}

startTracker();

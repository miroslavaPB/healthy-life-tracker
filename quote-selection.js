(function registerQuoteSelection(global) {
  const fallbackQuote = Object.freeze({
    id: "default",
    bg: {
      text: "Грижата расте с всяка малка стъпка.",
      author: "Неизвестен",
    },
    attribution: "Оригинален текст за приложението.",
  });

  function isValidQuote(quote) {
    return Boolean(
      quote &&
        typeof quote === "object" &&
        !Array.isArray(quote) &&
        quote.bg &&
        typeof quote.bg.text === "string" &&
        quote.bg.text.trim() &&
        typeof quote.bg.author === "string" &&
        quote.bg.author.trim(),
    );
  }

  function getDayOfYear(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    const year = date.getFullYear();
    const currentDay = Date.UTC(year, date.getMonth(), date.getDate());
    const firstDay = Date.UTC(year, 0, 1);
    return Math.floor((currentDay - firstDay) / 86400000) + 1;
  }

  function selectQuoteForDate(date, quotes, fallback = fallbackQuote) {
    const validFallback = isValidQuote(fallback) ? fallback : fallbackQuote;
    const validQuotes = Array.isArray(quotes) ? quotes.filter(isValidQuote) : [];
    const dayOfYear = getDayOfYear(date);

    if (validQuotes.length === 0 || dayOfYear === null) return validFallback;
    return validQuotes[(dayOfYear - 1) % validQuotes.length];
  }

  const api = Object.freeze({
    fallbackQuote,
    getDayOfYear,
    isValidQuote,
    selectQuoteForDate,
  });

  global.DailyQuoteSelection = api;
})(globalThis);

export function normalizedState(state) {
  return ["listed", "not_seen", "unknown"].includes(state) ? state : "unknown";
}

export function usableOrganizationName(value) {
  const name = String(value || "").replace(/[\[\]*_`~]/g, "").trim();
  if (!/[\p{L}\p{N}]/u.test(name)) return false;
  return !/^(?:n\/?a|unknown|unidentified|not available|none|null)$/i.test(name);
}

export function postType(item) {
  if (["headline", "review"].includes(item.post_type)) return item.post_type;
  // Old or malformed data can label a punctuation-only placeholder as a
  // victim. Keep those records in the data, but out of victim totals.
  if (item.post_type === "victim") {
    if (usableOrganizationName(item.organization)) return "victim";
    if (item.organization && !usableOrganizationName(item.organization)) return "review";
  }
  // Older schema files may lack both a type and a normalized organization.
  // Reclassify their title using the same obvious headline exclusions.
  const title = String(item.post_title || item.organization || "").trim().toLocaleLowerCase();
  const normalizedTitle = title.replace(/[\[\]*_`~]/g, "").replace(/\s+/g, " ").trim();
  if (!usableOrganizationName(normalizedTitle)) return "review";
  if (["welcome", "important announcement", "home", "about", "contact", "news", "blog", "victims", "victim list", "recent victims", "all victims", "load more", "read more", "why it matters", "what is stored", "warning", "press", "notice", "jurisdiction", "cooperation reached"].includes(normalizedTitle)) return "headline";
  if (/^announcement\s+(for|about)\b/.test(normalizedTitle)) return "review";
  if (/^(view all|load more|read more|what time does|what time is|response to |publication hold|press release|statement:|article:|why it matters|what is stored|warning:|notice:|jurisdiction:|cooperation reached)/.test(normalizedTitle)) return "headline";
  if (/\b(article|interview|press release|announcement)\b/.test(normalizedTitle)) return "headline";
  return "victim";
}

export function parseSortDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const months = new Map([
    ["jan", 0], ["january", 0], ["feb", 1], ["february", 1],
    ["mar", 2], ["march", 2], ["apr", 3], ["april", 3],
    ["may", 4], ["jun", 5], ["june", 5], ["jul", 6], ["july", 6],
    ["aug", 7], ["august", 7], ["sep", 8], ["sept", 8], ["september", 8],
    ["oct", 9], ["october", 9], ["nov", 10], ["november", 10],
    ["dec", 11], ["december", 11],
  ]);
  const monthDate = text.match(/^(\d{1,2})\s+([a-z]+)[,.]?\s+(\d{4})$/i)
    || text.match(/^([a-z]+)\s+(\d{1,2})[,]?\s+(\d{4})$/i);
  if (monthDate) {
    const dayFirst = /^\d/.test(monthDate[1]);
    const day = Number(dayFirst ? monthDate[1] : monthDate[2]);
    const month = months.get((dayFirst ? monthDate[2] : monthDate[1]).toLocaleLowerCase());
    const year = Number(monthDate[3]);
    if (month === undefined || day < 1 || day > 31) return null;
    const timestamp = Date.UTC(year, month, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
      ? timestamp
      : null;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

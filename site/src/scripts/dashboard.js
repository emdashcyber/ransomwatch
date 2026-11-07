import { normalizedState, parseSortDate, postType, usableOrganizationName } from "./classify.js";

import { parseView, viewURL, searchDebounce } from "./view-state.js";
import { latestRequest } from "./request.js";

export function startDashboard({ document, window, fetch, Option, timers }) {
const DATA_URL = document.querySelector("#main").dataset.victimsUrl;

const elements = {
  loading: document.querySelector("#loading-state"),
  error: document.querySelector("#error-state"),
  errorMessage: document.querySelector("#error-message"),
  empty: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyCopy: document.querySelector("#empty-copy"),
  tableWrap: document.querySelector("#table-wrap"),
  pagination: document.querySelector("#table-pagination"),
  previousPage: document.querySelector("#previous-page"),
  nextPage: document.querySelector("#next-page"),
  pageStatus: document.querySelector("#page-status"),
  rows: document.querySelector("#victim-rows"),
  search: document.querySelector("#search-input"),
  group: document.querySelector("#group-filter"),
  country: document.querySelector("#country-filter"),
  state: document.querySelector("#state-filter"),
  resultCount: document.querySelector("#result-count"),
  total: document.querySelector("#metric-total"),
  listed: document.querySelector("#metric-listed"),
  groups: document.querySelector("#metric-groups"),
  sources: document.querySelector("#metric-sources"),
  updated: document.querySelector("#updated-at"),
  status: document.querySelector("#view-status"),
  refresh: document.querySelector("#refresh-data"),
  retry: document.querySelector("#retry-data"),
  clear: document.querySelector("#clear-filters"),
  emptyClear: document.querySelector("#empty-clear"),
};

let dataset = null;
let view = parseView(new URL(window.location.href).searchParams);
let pending = false;
let failure = "";
const PAGE_SIZE = 100;

function setText(element, value) {
  element.textContent = value == null || value === "" ? "—" : String(value);
}

function displayDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options = includeTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }
    : { dateStyle: "medium", timeZone: "UTC" };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function stateLabel(state) {
  return {
    listed: "Currently listed",
    not_seen: "No longer seen",
    unknown: "Unknown / stale",
  }[normalizedState(state)];
}

function displayedOrganization(item) {
  if (usableOrganizationName(item.organization)) return item.organization.trim();
  if (usableOrganizationName(item.post_title)) return item.post_title.trim();
  return "";
}

function victimSightings() {
  return (dataset?.sightings || []).filter((item) => postType(item) === "victim");
}

function populateSelect(select, values, firstLabel) {
  select.replaceChildren(new Option(firstLabel, ""));
  for (const value of values) {
    select.add(new Option(value, value));
  }
}

function renderMetrics() {
  const sightings = victimSightings();
  const listedCount = sightings.filter((item) => normalizedState(item.listing_state) === "listed").length;
  const sourceTotal = (dataset.sources || []).length;
  const groupCount = (dataset.groups || []).length;
  setText(elements.total, sightings.length.toLocaleString());
  setText(elements.listed, listedCount.toLocaleString());
  setText(elements.groups, groupCount.toLocaleString());
  setText(elements.sources, sourceTotal.toLocaleString());
  elements.updated.textContent = dataset.updated_at
    ? "Last crawl " + displayDate(dataset.updated_at, true) + " UTC"
    : "No crawl has completed yet";
}

function populateFilters() {
  const sightings = victimSightings();
  const groupNames = new Map();
  for (const item of sightings) {
    if (item.group_id && item.group_name) groupNames.set(item.group_id, item.group_name);
  }
  elements.group.replaceChildren(new Option("All groups", ""));
  for (const [groupId, groupName] of [...groupNames.entries()].sort((left, right) => left[1].localeCompare(right[1]))) {
    elements.group.add(new Option(groupName, groupId));
  }
  populateSelect(
    elements.country,
    [...new Set(sightings.map((item) => item.country).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
    "All countries",
  );
}

function syncControls() {
  elements.search.value = view.q;
  for (const key of ["group", "country"]) {
    const select = elements[key];
    // A missing choice remains an explicit filter instead of broadening results.
    for (const option of [...select.options]) if (option.dataset.unavailable) option.remove();
    if (view[key] && ![...select.options].some(option => option.value === view[key])) {
      const option = new Option(view[key] + " (unavailable)", view[key]);
      option.dataset.unavailable = "true";
      select.add(option);
    }
    select.value = view[key];
  }
  elements.state.value = view.state;
}

function writeURL(replace = false) {
  const url = viewURL(window.location.href, view);
  if (url !== window.location.pathname + window.location.search + window.location.hash) {
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  }
}

function changeView(patch, replace = false) {
  search.cancel();
  const draft = elements.search.value;
  const page = draft !== view.q ? 1 : (patch.page ?? view.page);
  view = { ...view, q: draft, ...patch, page };
  syncControls();
  writeURL(replace);
  renderTable();
}
const search = searchDebounce(q => changeView({ q, page: 1 }, true), timers);

function searchText(item) {
  return [
    item.organization,
    item.group_name,
    item.country,
    item.sector,
    item.reported_date,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function claimTimestamp(item) {
  const timestamp = parseSortDate(item.reported_date) ?? parseSortDate(item.first_seen_at);
  if (timestamp === null) return 0;
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function compareSightings(left, right) {
  const dateOrder = claimTimestamp(right) - claimTimestamp(left);
  if (dateOrder) return dateOrder;
  const organizationOrder = displayedOrganization(left).localeCompare(
    displayedOrganization(right), undefined, { sensitivity: "base", numeric: true },
  );
  if (organizationOrder) return organizationOrder;
  const groupOrder = String(left.group_name || "").localeCompare(
    String(right.group_name || ""), undefined, { sensitivity: "base", numeric: true },
  );
  if (groupOrder) return groupOrder;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function addCell(row, className, text) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text || "—";
  row.append(cell);
  return cell;
}

function appendClaimDetails(cell, item) {
  const details = item.claim_details && typeof item.claim_details === "object" ? item.claim_details : {};
  const entries = [];
  const title = typeof item.post_title === "string" ? item.post_title.trim() : "";
  const organization = typeof item.organization === "string" ? item.organization.trim() : "";
  if (title && title.toLocaleLowerCase() !== organization.toLocaleLowerCase()) {
    entries.push(["Original listing title", title]);
  }
  entries.push(
    ["Listing description", details.description],
    ["Claimed data size", details.claimed_data_size],
    ["Claimed file count", details.file_count],
    ["Claimed deadline", details.deadline],
    ["Organization website shown", details.organization_website],
  );
  const visibleEntries = entries.filter((entry) => {
    if (typeof entry[1] !== "string" || !entry[1].trim()) return false;
    return !/^(?:[-—–]+|n\/?a|unknown|none|null)$/i.test(entry[1].trim());
  });
  if (!visibleEntries.length) return;

  const disclosure = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "View note and listing details";
  disclosure.append(summary);
  const list = document.createElement("dl");
  list.className = "claim-details-list";
  for (const [label, value] of visibleEntries) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    list.append(term, description);
  }
  disclosure.append(list);
  const note = document.createElement("p");
  note.className = "detail-attribution";
  note.textContent = "Information displayed by the threat actor; not independently verified.";
  disclosure.append(note);
  cell.append(disclosure);
}

function appendCountry(cell, item) {
  cell.textContent = item.country || "—";
  if (item.country && item.country_basis === "flag_inferred") {
    const note = document.createElement("span");
    note.className = "inferred-label";
    note.textContent = "Inferred from flag";
    cell.append(document.createElement("br"), note);
  }
}

function makeRow(item) {
  const row = document.createElement("tr");
  const organizationCell = addCell(row, "organization-cell", displayedOrganization(item));
  organizationCell.replaceChildren();
  const organizationName = document.createElement("div");
  organizationName.className = "organization-name";
  organizationName.textContent = displayedOrganization(item) || "Unidentified listing";
  organizationCell.append(organizationName);
  appendClaimDetails(organizationCell, item);

  addCell(row, "group-cell", item.group_name);
  addCell(row, "date-cell", item.reported_date || "—");
  const countryCell = document.createElement("td");
  appendCountry(countryCell, item);
  row.append(countryCell);
  addCell(row, "", item.sector);
  addCell(row, "date-cell", displayDate(item.last_seen_at));

  const stateCell = document.createElement("td");
  const state = normalizedState(item.listing_state);
  const pill = document.createElement("span");
  pill.className = "status-pill " + { listed: "good", not_seen: "warn", unknown: "dim" }[state];
  pill.textContent = stateLabel(state);
  stateCell.append(pill);
  row.append(stateCell);
  const labels = ["Organization", "Group", "Reported date", "Country", "Sector", "Last observed", "Listing state"];
  Array.from(row.cells).forEach((cell, columnIndex) => {
    cell.dataset.label = labels[columnIndex];
  });
  return row;
}

function filteredSightings() {
  const query = view.q.trim().toLocaleLowerCase();
  const { group, country, state } = view;
  return victimSightings()
    .filter((item) => !query || searchText(item).includes(query))
    .filter((item) => !group || item.group_id === group)
    .filter((item) => !country || item.country === country)
    .filter((item) => !state || normalizedState(item.listing_state) === state)
    .sort(compareSightings);
}

function renderTable() {
  elements.refresh.disabled = pending;
  elements.retry.disabled = pending;
  elements.loading.hidden = !pending;
  elements.loading.textContent = dataset ? "Refreshing victim data; showing the last successful dataset…" : "Loading victim data…";
  elements.error.hidden = !failure;
  elements.errorMessage.textContent = (dataset ? "Refresh failed. Showing the last successful dataset. " : "Victim data is unavailable. ") + failure;
  if (!dataset) {
    elements.rows.replaceChildren();
    elements.tableWrap.hidden = elements.empty.hidden = elements.pagination.hidden = true;
    elements.previousPage.disabled = elements.nextPage.disabled = true;
    elements.resultCount.textContent = "";
    elements.status.textContent = pending ? "Loading victim data…" : "Victim data is unavailable. Retry to load it.";
    return;
  }
  const items = filteredSightings();
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (view.page > pageCount) { view.page = pageCount; writeURL(true); }
  const startIndex = (view.page - 1) * PAGE_SIZE;
  const pageItems = items.slice(startIndex, startIndex + PAGE_SIZE);
  elements.rows.replaceChildren(...pageItems.map(makeRow));
  elements.resultCount.textContent = items.length.toLocaleString() + " matching claims";
  elements.pagination.hidden = items.length === 0;
  elements.previousPage.disabled = view.page <= 1;
  elements.nextPage.disabled = view.page >= pageCount;
  const firstVisible = items.length ? startIndex + 1 : 0;
  const lastVisible = Math.min(startIndex + PAGE_SIZE, items.length);
  elements.pageStatus.textContent = items.length
    ? "Page " + view.page.toLocaleString() + " of " + pageCount.toLocaleString() +
      " · showing " + firstVisible.toLocaleString() + "–" + lastVisible.toLocaleString()
    : "";
  const hasFilters = Boolean(
    view.q || view.group || view.country || view.state,
  );
  elements.status.textContent = (pending ? "Refreshing. " : failure ? "Refresh failed; showing saved results. " : "") +
    elements.resultCount.textContent + (items.length ? "; showing " + firstVisible.toLocaleString() + "–" + lastVisible.toLocaleString() + "." : ".");
  elements.emptyClear.hidden = !hasFilters;
  elements.tableWrap.hidden = items.length === 0;
  elements.empty.hidden = items.length !== 0;
  if (!items.length) {
    elements.emptyTitle.textContent = hasFilters ? "No matching sightings" : "No victim claims yet";
    elements.emptyCopy.textContent = hasFilters
      ? "Change a filter or clear the search."
      : "The dashboard will populate after a successful leak-site crawl.";
  }
}

const request = latestRequest(async signal => {
  const response = await fetch(DATA_URL, { cache: "no-cache", signal });
  if (!response.ok) throw new Error("Data request returned " + response.status);
  const result = await response.json();
  if (!result || !Array.isArray(result.sightings) || !Array.isArray(result.sources)) {
    throw new Error("The victim data file has an unexpected format.");
  }
  return result;
}, update => {
  pending = update.pending;
  failure = update.error;
  if (update.data) {
    dataset = update.data;
    renderMetrics();
    populateFilters();
    // Preserve the search draft while a refresh completes.
    const draft = elements.search.value;
    syncControls();
    elements.search.value = draft;
  }
  renderTable();
});

elements.search.addEventListener("input", () => search.schedule(elements.search.value));
for (const key of ["group", "country", "state"]) {
  elements[key].addEventListener("change", () => changeView({ [key]: elements[key].value, page: 1 }));
}
for (const button of [elements.clear, elements.emptyClear]) {
  button.addEventListener("click", () => {
    changeView({ ...parseView(new URLSearchParams()) });
    elements.search.focus();
  });
}
elements.previousPage.addEventListener("click", () => changeView({ page: Math.max(1, view.page - 1) }));
elements.nextPage.addEventListener("click", () => changeView({ page: view.page + 1 }));
for (const button of [elements.refresh, elements.retry]) button.addEventListener("click", () => { if (!pending) return request.load(); });
window.addEventListener("popstate", () => {
  search.cancel();
  view = parseView(new URL(window.location.href).searchParams);
  syncControls();
  writeURL(true);
  renderTable();
});
syncControls();
writeURL(true);
const ready = request.load();
return { ready, reload: request.load };
}

if (typeof document !== "undefined") startDashboard({ document, window, fetch, Option });

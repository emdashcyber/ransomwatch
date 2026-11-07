const keys = ["q", "group", "country", "state", "page"];
export function parseView(params) {
  const raw = params.get("page") || "1", page = Number(raw);
  return {
    q: params.get("q") || "", group: params.get("group") || "", country: params.get("country") || "",
    state: ["listed", "not_seen", "unknown"].includes(params.get("state")) ? params.get("state") : "",
    page: /^\d+$/.test(raw) && Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function viewURL(input, view) {
  const url = new URL(input);
  for (const key of keys) {
    url.searchParams.delete(key);
    if (view[key] !== "" && !(key === "page" && view.page === 1)) url.searchParams.set(key, String(view[key]));
  }
  return url.pathname + url.search + url.hash;
}
export function searchDebounce(commit, timers = { set: (run, ms) => setTimeout(run, ms), clear: id => clearTimeout(id) }) {
  let timer, generation = 0;
  const cancel = () => { generation++; if (timer !== undefined) timers.clear(timer); timer = undefined; };
  return { cancel, schedule(value) { cancel(); const request = generation; timer = timers.set(() => { if (request === generation) { timer = undefined; commit(value); } }, 300); } };
}

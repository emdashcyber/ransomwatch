import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDashboard } from '../src/scripts/dashboard.js';
import { parseView, viewURL, searchDebounce } from '../src/scripts/view-state.js';
import { browser, deferred } from './browser.mjs';
const data = { sources: [{}], groups: [{}], updated_at: '2026-10-01', sightings: Array.from({ length: 105 }, (_, i) => ({ id: String(i), organization: `Company ${i}`, group_id: 'one', group_name: 'Group One', country: 'AU', listing_state: 'listed', post_type: 'victim' })) };
const response = value => ({ ok: true, json: async () => value });
function setup(url, fetch = async () => response(data)) {
  const b = browser(url); b.el('main').dataset.victimsUrl = '/dashboard/victims.json';
  const app = startDashboard({ ...b, fetch });
  return { ...b, ...app };
}

test('query round trip, defaults, invalid pages and listing states preserve unrelated context', () => {
  const url = new URL('https://example.test/nested/?q=A%26B&group=missing&country=NZ&state=not_seen&page=3&utm=x#claims');
  const view = parseView(url.searchParams);
  assert.deepEqual(parseView(new URL(viewURL(url, view), url).searchParams), view);
  assert.match(viewURL(url, view), /^\/nested\/\?.*utm=x.*#claims$/);
  for (const page of ['0', '-1', '1.5', 'Infinity', '9007199254740992', 'garbage']) assert.equal(parseView(new URLSearchParams({ page, state: 'invalid' })).page, 1);
  assert.equal(parseView(new URLSearchParams('state=invalid')).state, '');
  assert.equal(viewURL(url, parseView(new URLSearchParams())), '/nested/?utm=x#claims');
});
test('cancelled debounce cannot commit, including an already queued callback', () => {
  let cb; const values = []; const search = searchDebounce(v => values.push(v), { set(fn, ms) { assert.equal(ms, 300); cb = fn; }, clear() {} });
  search.schedule('old'); search.cancel(); cb(); assert.deepEqual(values, []);
});
test('initial loading, unavailable filters, clamping, clear, history and debounce cancellation', async () => {
  const pending = deferred(); const h = setup('https://example.test/ransomwatch/?country=NZ&page=99&utm=x#claims', () => pending.promise);
  h.el('search-input').value = 'Company'; h.el('search-input').dispatch('input'); h.flush();
  assert.equal(h.el('empty-state').hidden, true);
  assert.equal(h.el('result-count').textContent, '');
  assert.equal(h.el('refresh-data').disabled, true);
  pending.resolve(response(data)); await h.ready;
  assert.equal(h.el('country-filter').value, 'NZ');
  assert.match(h.el('country-filter').textContent, /NZ \(unavailable\)/);
  assert.match(h.el('result-count').textContent, /^0 matching/);
  assert.equal(h.el('empty-clear').hidden, false);
  h.el('clear-filters').click();
  assert.equal(h.window.location.search, '?utm=x');
  assert.equal(h.el('victim-rows').children.length, 100);
  assert.match(h.el('page-status').textContent, /showing 1–100/);
  h.el('next-page').click(); assert.equal(h.el('victim-rows').children.length, 5);
  assert.match(h.el('result-count').textContent, /105 matching/);
  assert.match(h.el('page-status').textContent, /101–105/);
  const historyLength = h.history.length;
  h.el('search-input').value = 'pending'; h.el('search-input').dispatch('input');
  h.go(-1); h.flush(); assert.equal(h.el('search-input').value, '');
  assert.equal(h.history.length, historyLength);
  h.go(1); assert.equal(h.el('victim-rows').children.length, 5);
  await h.navigate('?page=999&utm=x#claims'); assert.equal(h.window.location.search, '?utm=x&page=2');
  h.el('search-input').value = 'Company 104'; h.el('search-input').dispatch('input'); h.flush();
  assert.match(h.window.location.search, /q=Company\+104/);
  assert.equal(h.el('victim-rows').children.length, 1);
  assert.equal(h.el('previous-page').disabled, true);
  assert.equal(h.el('table-pagination').hidden, false, 'The displayed range remains visible on a single page');
  h.el('clear-filters').click();
  h.el('search-input').value = 'Company'; h.el('search-input').dispatch('input');
  h.el('next-page').click(); h.flush();
  assert.match(h.el('page-status').textContent, /Page 1/);
  assert.match(h.window.location.search, /q=Company/);
});
test('initial failure and retry; refresh failure retains consistent metrics and rows', async () => {
  let fail = true; let calls = 0;
  const h = setup(undefined, async () => { calls++; if (fail) throw new Error('offline'); return response(data); });
  await h.ready; assert.equal(h.el('empty-state').hidden, true); assert.match(h.el('view-status').textContent, /unavailable/);
  fail = false; await h.el('retry-data').click();
  assert.equal(h.el('victim-rows').children.length, 100); assert.equal(h.el('metric-total').textContent, '105');
  fail = true; await h.el('refresh-data').click();
  assert.equal(h.el('victim-rows').children.length, 100); assert.equal(h.el('metric-total').textContent, '105');
  assert.match(h.el('error-message').textContent, /Refresh failed.*last successful.*offline/);
  assert.equal(calls, 3);
});
test('superseded responses, errors and JSON completions cannot change results; refresh retains filters', async () => {
  const requests = [];
  const h = setup(undefined, (_, options) => { const r = { ...deferred(), signal: options.signal }; requests.push(r); return r.promise; });
  const second = h.reload(); assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(response(data)); await second;
  requests[0].reject(new Error('stale')); await h.ready;
  assert.equal(h.el('error-state').hidden, true);
  const decoding = deferred(); requests.length = 0;
  const old = h.reload(); requests[0].resolve({ ok: true, json: () => decoding.promise }); await Promise.resolve(); await Promise.resolve();
  const next = h.reload();
  h.el('country-filter').value = 'AU'; h.el('country-filter').dispatch('change');
  requests[1].resolve(response({ ...data, sightings: [] })); await next;
  decoding.resolve(data); await old;
  assert.equal(h.el('metric-total').textContent, '0');
  assert.equal(h.el('country-filter').value, 'AU'); assert.match(h.el('country-filter').textContent, /AU \(unavailable\)/);
  assert.match(h.el('result-count').textContent, /^0 matching/);
});

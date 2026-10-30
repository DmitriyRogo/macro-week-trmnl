import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFred, fetchEarnings, fetchSeries } from '../src/sources.js';
import { macroResult } from '../src/results.js';
import { RELEASES } from '../src/config.js';

const fakeFetch = (status, body, seen = []) => async (url, init) => {
  seen.push({ url: String(url), init });
  return { ok: status < 400, status, json: async () => body };
};

test('FRED request parameters', async () => {
  const seen = [];
  const rows = await fetchFred({ apiKey: 'k', from: '2026-10-27', to: '2026-11-05', fetchImpl: fakeFetch(200, { release_dates: [{ release_id: 10 }] }, seen) });
  assert.equal(rows.length, 1);
  const q = new URL(seen[0].url).searchParams;
  assert.equal(q.get('include_release_dates_with_no_data'), 'true');
  assert.equal(q.get('file_type'), 'json');
  assert.equal(q.get('realtime_start'), '2026-10-27');
  assert.equal(q.get('realtime_end'), '2026-11-05');
});

// FRED clamps realtime_start to the requested window; rows mimic its output for payrolls
// released Fri Nov 6 2026 (Oct value new, Sep revised) with since = Nov 5.
test('FRED series: vintage window, revised rows dropped, release detected', async () => {
  const row = (date, value, rs, re = '9999-12-31') => ({ date, value, realtime_start: rs, realtime_end: re });
  const after = [
    row('2026-10-01', '159700', '2026-11-06'),
    row('2026-09-01', '159550', '2026-11-06'),
    row('2026-09-01', '159500', '2026-11-05', '2026-11-05'), // superseded by the revision
    row('2026-08-01', '159400', '2026-11-05'),
  ];
  const seen = [];
  const obs = await fetchSeries({ apiKey: 'k', seriesId: 'PAYEMS', since: '2026-11-05', fetchImpl: fakeFetch(200, { observations: after }, seen) });
  const q = new URL(seen[0].url).searchParams;
  assert.equal(q.get('realtime_start'), '2026-11-05');
  assert.equal(q.get('realtime_end'), '9999-12-31');
  assert.deepEqual(obs.map(o => o.value), ['159700', '159550', '159400']);
  assert.deepEqual(macroResult(RELEASES[50], obs, '2026-11-06'), { value: '+150K', unit: 'payrolls', prev: '+150K', dir: 'flat' });

  // Before the release: everything is clamped to since, so no result yet.
  const before = [row('2026-09-01', '159500', '2026-11-05'), row('2026-08-01', '159400', '2026-11-05'), row('2026-07-01', '159300', '2026-11-05')];
  const stale = await fetchSeries({ apiKey: 'k', seriesId: 'PAYEMS', since: '2026-11-05', fetchImpl: fakeFetch(200, { observations: before }) });
  assert.equal(macroResult(RELEASES[50], stale, '2026-11-06'), null);
});

test('Finnhub sends the key in a header, not the URL, and no symbol filter', async () => {
  const seen = [];
  await fetchEarnings({ apiKey: 'secret', from: '2026-10-26', to: '2026-10-26', fetchImpl: fakeFetch(200, { earningsCalendar: [] }, seen) });
  assert.ok(!seen[0].url.includes('secret'));
  assert.ok(!seen[0].url.includes('symbol'));
  assert.equal(seen[0].init.headers['X-Finnhub-Token'], 'secret');
});

test('Finnhub is asked one day at a time', async () => {
  const seen = [];
  await fetchEarnings({ apiKey: 'k', from: '2026-10-26', to: '2026-10-30', fetchImpl: fakeFetch(200, { earningsCalendar: [{ symbol: 'X' }] }, seen) });
  assert.deepEqual(seen.map(s => new URL(s.url).searchParams.get('from')), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  assert.ok(seen.every(s => { const q = new URL(s.url).searchParams; return q.get('from') === q.get('to'); }));
});

test('errors carry status but never the URL or key', async () => {
  await assert.rejects(fetchFred({ apiKey: 'secret', from: 'a', to: 'b', fetchImpl: fakeFetch(400, {}) }),
    err => err.message === 'FRED HTTP 400');
  await assert.rejects(fetchEarnings({ apiKey: 'secret', from: 'a', to: 'b', fetchImpl: fakeFetch(200, { error: 'You don\'t have access' }) }),
    err => /Finnhub bad response/.test(err.message) && !err.message.includes('secret'));
});

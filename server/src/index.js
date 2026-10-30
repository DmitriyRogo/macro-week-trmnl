import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { buildWeek, seriesNeeded, configWarnings } from './build.js';
import { fetchFred, fetchEarnings, fetchSeries, fetchAuctions } from './sources.js';
import { TICKER_GROUPS } from './config.js';
import { todayET, timeET, weekDays, addDays } from './dates.js';

const {
  FRED_API_KEY, FINNHUB_API_KEY, ACCESS_TOKEN,
  PORT = '8080',
  REFRESH_MINUTES = '60',
  FAST_MINUTES = '5', // on release days, re-check this often until each result is in
  MAX_STALE_HOURS = '36', // past this, a source counts as unavailable and its section hides
} = process.env;

if (!FRED_API_KEY || !FINNHUB_API_KEY) {
  console.error('FRED_API_KEY and FINNHUB_API_KEY must be set');
  process.exit(1);
}

// Last good response per source. A failed refresh keeps the previous data.
// series: FRED observations per series id, for this week's results.
const cache = { fred: { data: null, at: 0 }, earnings: { data: null, at: 0 }, auctions: { data: null, at: 0 }, series: {} };

// FRED's window starts two weeks early so build.js can spot repeat release dates (minGapDays).
async function refreshSource(name, fetcher, apiKey, lookbackDays = 0) {
  const days = weekDays(todayET());
  const window = { apiKey, from: addDays(days[0], -lookbackDays), to: days[4] };
  try {
    cache[name] = { data: await fetcher(window), at: Date.now() };
    console.log(`${new Date().toISOString()} ${name}: ${cache[name].data.length} rows`);
  } catch (err) {
    console.error(`${new Date().toISOString()} ${name} refresh failed: ${err.message}`);
  }
}

// Result series for releases already due this week. Sequential: a handful of calls per hour.
async function refreshSeries() {
  for (const { id: seriesId, since } of seriesNeeded({ fred: cache.fred.data, today: todayET() })) {
    try {
      cache.series[seriesId] = await fetchSeries({ apiKey: FRED_API_KEY, seriesId, since, limit: since ? 20 : 15 });
    } catch (err) {
      console.error(`${new Date().toISOString()} ${seriesId} refresh failed: ${err.message}`);
    }
  }
}

const refreshAll = async () => {
  await Promise.all([
    refreshSource('fred', fetchFred, FRED_API_KEY, 14),
    refreshSource('earnings', fetchEarnings, FINNHUB_API_KEY),
    refreshSource('auctions', fetchAuctions),
  ]);
  await refreshSeries();
};

// Release-day fast path: results should appear minutes after a release, not up to an hour
// later. Every FAST_MINUTES, rebuild the week and re-fetch only the sources that still owe a
// result for an event that happened today in the last few hours.
const AT = { BMO: '0700', DMH: '1200', AMC: '1600', TBD: '2359' };
const toMin = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
const eventAt = e => AT[e.time] ?? e.time.padStart(5, '0').replace(':', '');
const SOURCE = { macro: 'series', auction: 'auctions', earn: 'earnings' }; // FOMC's result posts the next day

function pendingSources(now = new Date()) {
  const today = todayET(now);
  const mins = toMin(timeET(now));
  const owed = new Set();
  for (const group of Object.keys(TICKER_GROUPS)) {
    const week = buildWeek({ fred: cache.fred.data, earnings: cache.earnings.data, series: cache.series, auctions: cache.auctions.data, today, now: timeET(now), group });
    const day = week.days.find(d => d.date === today);
    for (const e of day ? [...day.events, ...day.earnings] : []) {
      const late = mins - toMin(eventAt(e));
      if (SOURCE[e.kind] && !e.result && !e.no_result && late >= 0 && late <= 240) owed.add(SOURCE[e.kind]);
    }
  }
  return owed;
}

async function fastRefresh() {
  const owed = pendingSources();
  if (owed.has('series')) await refreshSeries();
  if (owed.has('auctions')) await refreshSource('auctions', fetchAuctions);
  if (owed.has('earnings')) await refreshSource('earnings', fetchEarnings, FINNHUB_API_KEY);
}

const fresh = ({ data, at }) => (data && Date.now() - at < Number(MAX_STALE_HOURS) * 3_600_000 ? data : null);

const authorized = req => {
  if (!ACCESS_TOKEN) return true;
  const got = Buffer.from(req.headers.authorization ?? '');
  const want = Buffer.from(`Bearer ${ACCESS_TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
};

// TRMNL fills select fields with a slug of the option label; accept 'Big banks', 'big-banks', 'big_banks'.
const param = (url, name) => (url.searchParams.get(name) ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || undefined;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const firstRefresh = refreshAll();
setInterval(refreshAll, Number(REFRESH_MINUTES) * 60_000).unref();
setInterval(() => fastRefresh().catch(err => console.error(`fast refresh failed: ${err.message}`)), Number(FAST_MINUTES) * 60_000).unref();

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });

  if (url.pathname === '/healthz') {
    const age = ({ at }) => (at ? Math.round((Date.now() - at) / 60_000) : null);
    // warnings: hand-kept tables in config.js about to run out (the uptime check fails on these).
    return send(res, 200, {
      ok: true, fred_age_min: age(cache.fred), earnings_age_min: age(cache.earnings), auctions_age_min: age(cache.auctions),
      warnings: configWarnings(todayET()),
    });
  }

  if (url.pathname === '/week') {
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    if (!cache.fred.at && !cache.earnings.at) await firstRefresh; // cold start: wait for the first fetch
    const now = new Date();
    const week = buildWeek({
      fred: fresh(cache.fred),
      earnings: fresh(cache.earnings),
      series: cache.series,
      auctions: fresh(cache.auctions),
      today: todayET(now),
      now: timeET(now),
      scope: param(url, 'scope'),
      group: param(url, 'group'),
    });
    return send(res, 200, week, { 'Cache-Control': 'public, max-age=300' });
  }

  send(res, 404, { error: 'not found' });
}).listen(Number(PORT), () => console.log(`macro-week-server listening on :${PORT}`));

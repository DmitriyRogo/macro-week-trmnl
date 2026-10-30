import { addDays } from './dates.js';

// Upstream fetchers. Errors never include the request URL, so API keys can't leak into logs.

const getJson = async (fetchImpl, url, init, name) => {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
  return res.json();
};

// Every scheduled release (all sources) between from and to, inclusive.
export async function fetchFred({ apiKey, from, to, fetchImpl = fetch }) {
  const url = new URL('https://api.stlouisfed.org/fred/releases/dates');
  url.search = new URLSearchParams({
    api_key: apiKey,
    file_type: 'json',
    include_release_dates_with_no_data: 'true', // otherwise future dates are excluded
    realtime_start: from,
    realtime_end: to,
    sort_order: 'asc',
    limit: '1000',
  });
  const body = await getJson(fetchImpl, url, {}, 'FRED');
  if (!Array.isArray(body.release_dates)) throw new Error(`FRED bad response: ${body.error_message ?? 'no release_dates'}`);
  if (body.release_dates.length >= 1000) console.warn('FRED release calendar: 1000 rows, may be truncated');
  return body.release_dates;
}

// Newest current observations of one FRED series, newest first. Each has date, value
// ('.' = missing) and realtime_start.
// FRED clamps realtime_start to the requested window (by default today..today, so every
// row would say "today"). With since = the day before a release, a value already
// published reads realtime_start = since, and one published on/after the release day
// carries its real publication date: that is how we tell whether the release has landed.
// Revised values come back as extra rows, so keep only the current ones.
export async function fetchSeries({ apiKey, seriesId, since, limit = 20, fetchImpl = fetch }) {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  const params = { api_key: apiKey, series_id: seriesId, file_type: 'json', sort_order: 'desc', limit: String(limit) };
  if (since) Object.assign(params, { realtime_start: since, realtime_end: LATEST });
  url.search = new URLSearchParams(params);
  const body = await getJson(fetchImpl, url, {}, `FRED ${seriesId}`);
  if (!Array.isArray(body.observations)) throw new Error(`FRED ${seriesId} bad response: ${body.error_message ?? 'no observations'}`);
  return since ? body.observations.filter(o => o.realtime_end === LATEST) : body.observations;
}

const LATEST = '9999-12-31';

// Treasury notes and bonds announced in the last 3 weeks, with results once auctioned.
// Covers this week's auctions: each is announced about a week ahead. No key needed.
export async function fetchAuctions({ fetchImpl = fetch } = {}) {
  const url = 'https://www.treasurydirect.gov/TA_WS/securities/announced?format=json&days=21';
  const body = await getJson(fetchImpl, url, {}, 'TreasuryDirect');
  if (!Array.isArray(body)) throw new Error('TreasuryDirect bad response');
  return body.filter(r => r.securityType !== 'Bill');
}

// Whole-market earnings calendar between from and to; filtered to the curated list later.
// Finnhub returns at most 1500 rows per call and drops the rest (a busy week can pass
// that), so ask one day at a time.
export async function fetchEarnings({ apiKey, from, to, fetchImpl = fetch }) {
  const rows = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const url = new URL('https://finnhub.io/api/v1/calendar/earnings');
    url.search = new URLSearchParams({ from: day, to: day });
    const body = await getJson(fetchImpl, url, { headers: { 'X-Finnhub-Token': apiKey } }, 'Finnhub');
    if (!Array.isArray(body.earningsCalendar)) throw new Error(`Finnhub bad response: ${body.error ?? 'no earningsCalendar'}`);
    if (body.earningsCalendar.length >= 1500) console.warn(`Finnhub ${day}: 1500 rows, may be truncated`);
    rows.push(...body.earningsCalendar);
  }
  return rows;
}

import { RELEASES, FOMC, FED_TARGET, MARKET_CLOSED, EARLY_CLOSE, TICKERS, EARNINGS_PER_DAY, SYMBOL_ALIASES, UPCOMING_LIMIT, LATEST_LIMIT } from './config.js';
import { dow, weekDays, weekLabel, addDays } from './dates.js';
import { macroResult, fomcResult, earningsResult } from './results.js';

// Earnings report times as sortable HHMM. TBD sorts last in the day.
const HOURS = { bmo: { label: 'BMO', at: '0700' }, dmh: { label: 'DMH', at: '1200' }, amc: { label: 'AMC', at: '1600' } };
const TBD = { label: 'TBD', at: '2359' };
const RANK = new Map(TICKERS.map((t, i) => [t, i]));
const hhmm = t => t.padStart(5, '0').replace(':', ''); // '8:30' -> '0830'

// Releases whose result series the server should fetch for this week (dates up to today).
// FRED rows for tracked releases that actually publish: drops a date that comes within
// rel.minGapDays of the same release's previous date. Needs rows from before the week.
const releaseDates = fred => {
  const last = {};
  return (fred ?? []).filter(r => RELEASES[r.release_id]).sort((a, b) => a.date.localeCompare(b.date)).filter(r => {
    const rel = RELEASES[r.release_id];
    const prev = last[r.release_id];
    last[r.release_id] = r.date;
    return !(rel.minGapDays && prev && prev !== r.date && r.date < addDays(prev, rel.minGapDays));
  });
};

export function seriesNeeded({ fred, today }) {
  const days = new Set(weekDays(today));
  const need = new Map(); // seriesId -> since (day before the release; null = no vintage check)
  for (const r of releaseDates(fred)) {
    const rel = RELEASES[r.release_id];
    if (days.has(r.date) && r.date <= today) need.set(rel.series, addDays(r.date, -1));
  }
  if (FOMC.some(f => days.has(f.date) && f.date <= today)) need.set(FED_TARGET.upper, null).set(FED_TARGET.lower, null);
  return [...need].map(([id, since]) => ({ id, since }));
}

/**
 * Builds the JSON the TRMNL templates render. Pure: same inputs, same output.
 *   fred      FRED release_dates rows, or null if unavailable
 *   earnings  Finnhub earningsCalendar rows, or null if unavailable
 *   series    { [seriesId]: observations newest-first } for results
 *   today     'YYYY-MM-DD' (ET), now: 'HHMM' (ET)
 */
export function buildWeek({ fred, earnings, series = {}, today, now = '0000', scope = 'all_tracked_releases', generatedAt = new Date().toISOString() }) {
  const dates = weekDays(today);
  const inWeek = new Set(dates);
  const allTracked = scope !== 'headline_only';
  const byDate = new Map(dates.map(d => [d, { macro: [], earn: [] }]));
  const base = { sep: false, eps: null, result: null, verdict: null };

  for (const r of releaseDates(fred)) {
    const rel = RELEASES[r.release_id];
    if (!inWeek.has(r.date) || (rel.tier === 2 && !allTracked)) continue;
    const list = byDate.get(r.date).macro;
    if (list.some(e => e.label === rel.label)) continue;
    list.push({ ...base, kind: 'macro', label: rel.label, time: rel.time, major: rel.tier === 1, _at: hhmm(rel.time), _tie: rel.tier,
      result: macroResult(rel, series[rel.series], r.date) });
  }

  for (const f of FOMC) {
    if (!inWeek.has(f.date)) continue;
    byDate.get(f.date).macro.push({ ...base, kind: 'fomc', label: 'FOMC', time: '2:00', major: true, sep: f.sep, _at: '1400', _tie: 0,
      result: fomcResult(series[FED_TARGET.upper], series[FED_TARGET.lower], f.date) });
  }

  for (const row of earnings ?? []) {
    const e = { ...row, symbol: SYMBOL_ALIASES[row.symbol] ?? row.symbol };
    if (!RANK.has(e.symbol) || !inWeek.has(e.date)) continue;
    const list = byDate.get(e.date).earn;
    if (list.some(x => x.label === e.symbol)) continue;
    const h = HOURS[e.hour] ?? TBD;
    const result = earningsResult(e);
    list.push({ ...base, kind: 'earn', label: e.symbol, time: h.label, major: false, _at: h.at, _tie: 3 + RANK.get(e.symbol), _rank: RANK.get(e.symbol),
      eps: typeof e.epsEstimate === 'number' ? e.epsEstimate.toFixed(2) : null,
      result, verdict: result?.verdict ?? null });
  }

  const order = (a, b) => a._at.localeCompare(b._at) || a._tie - b._tie;
  const status = (date, at) => (date < today || (date === today && at <= now) ? 'past' : 'future');
  const days = dates.map(date => {
    const { macro, earn } = byDate.get(date);
    // Keep the highest-ranked tickers, then show them in time-of-day order.
    const shown = earn.sort((a, b) => a._rank - b._rank).slice(0, EARNINGS_PER_DAY).sort(order);
    const tag = e => ({ ...e, date, dow: dow(date), is_today: date === today, status: status(date, e._at) });
    return {
      date, dow: dow(date), day: Number(date.slice(8)), is_today: date === today,
      status: date < today ? 'past' : date === today ? 'today' : 'future',
      market: MARKET_CLOSED.has(date) ? 'closed' : EARLY_CLOSE.has(date) ? 'early_close' : 'open',
      events: macro.sort(order).map(tag), earnings: shown.map(tag), earnings_more: earn.length - shown.length,
    };
  });

  const all = days.flatMap(d => [...d.events, ...d.earnings].sort(order));
  const upcoming = all.filter(e => e.status === 'future');
  const latest = all.filter(e => e.status === 'past' && e.result).reverse().slice(0, LATEST_LIMIT);
  const next = upcoming[0] ? { ...upcoming[0], when: whenLabel(upcoming[0], today) } : null;

  const strip = ({ _at, _tie, _rank, ...e }) => e;
  return {
    generated_at: generatedAt,
    today,
    week_label: weekLabel(dates),
    scope: allTracked ? 'all_tracked_releases' : 'headline_only',
    macro_ok: Array.isArray(fred),
    earnings_ok: Array.isArray(earnings),
    next: next && strip(next),
    latest: latest.map(strip),
    upcoming: upcoming.slice(0, UPCOMING_LIMIT).map(strip),
    days: days.map(d => ({ ...d, events: d.events.map(strip), earnings: d.earnings.map(strip) })),
  };
}

// 'Today 8:30', 'Tomorrow AMC', 'Thu 2:00'. Day-level wording stays true between hourly refreshes.
function whenLabel(e, today) {
  const day = e.date === today ? 'Today' : e.date === addDays(today, 1) ? 'Tomorrow' : e.dow;
  return `${day} ${e.time}`;
}

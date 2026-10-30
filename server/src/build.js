import {
  RELEASES, FOMC, FED_TARGET, FOMC_MINUTES_LAG_DAYS, FOMC_MINUTES_OVERRIDES, ISM, AUCTION_TERMS, MARKET_CLOSED, EARLY_CLOSE,
  TICKER_GROUPS, DEFAULT_GROUP, MAX_CUSTOM_TICKERS, TIME_ZONES, DEFAULT_ZONE, EARNINGS_PER_DAY, SYMBOL_ALIASES, UPCOMING_LIMIT, LATEST_LIMIT, CONFIG_WARN_DAYS,
} from './config.js';
import { dow, weekDays, weekLabel, addDays, nthBusinessDay, fromET } from './dates.js';
import { macroResult, extraResult, fomcResult, earningsResult, auctionResult } from './results.js';

// Earnings report times as sortable HHMM. TBD sorts last in the day.
const HOURS = { bmo: { label: 'BMO', at: '0700' }, dmh: { label: 'DMH', at: '1200' }, amc: { label: 'AMC', at: '1600' } };
const TBD = { label: 'TBD', at: '2359' };
const hhmm = t => t.padStart(5, '0').replace(':', ''); // '8:30' -> '0830'

// '1330' -> '1:30', or '13:30' on a 24-hour clock.
const clock = (at, h24) => `${h24 ? Number(at.slice(0, 2)) : Number(at.slice(0, 2)) % 12 || 12}:${at.slice(2)}`;

// "Your tickers" form text ('nvda, brk-b  UBER') -> ['NVDA', 'BRK.B', 'UBER'].
export const parseTickers = raw => [...new Set(String(raw ?? '').toUpperCase().replace(/-/g, '.').split(/[\s,;]+/)
  .filter(t => /^[A-Z][A-Z0-9.]{0,7}$/.test(t)))].slice(0, MAX_CUSTOM_TICKERS);

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
    if (!days.has(r.date) || r.date > today) continue;
    need.set(rel.series, addDays(r.date, -1));
    if (rel.extra) need.set(rel.extra.series, addDays(r.date, -1));
  }
  if (FOMC.some(f => days.has(f.date) && f.date <= today)) need.set(FED_TARGET.upper, null).set(FED_TARGET.lower, null);
  return [...need].map(([id, since]) => ({ id, since }));
}

/**
 * Builds the JSON the TRMNL templates render. Pure: same inputs, same output.
 *   fred      FRED release_dates rows, or null if unavailable
 *   earnings  Finnhub earningsCalendar rows, or null if unavailable
 *   series    { [seriesId]: observations newest-first } for results
 *   auctions  TreasuryDirect announced securities, or null if unavailable
 *   today     'YYYY-MM-DD', now: 'HHMM', both in the viewer's zone
 *   scope     'all_tracked_releases' | 'headline_only'; group: key of TICKER_GROUPS
 *   tickers   symbols from the "Your tickers" field, shown ahead of the group
 *   zone      key of TIME_ZONES: times on screen are converted to it
 */
export function buildWeek({ fred, earnings, series = {}, auctions = null, today, now = '0000', scope = 'all_tracked_releases', group = DEFAULT_GROUP, tickers = [], zone = DEFAULT_ZONE, generatedAt = new Date().toISOString() }) {
  const dates = weekDays(today, now);
  const { tz, label: tzLabel, h24 } = TIME_ZONES[zone] ?? TIME_ZONES[DEFAULT_ZONE];
  const inWeek = new Set(dates);
  const allTracked = scope !== 'headline_only';
  const mine = tickers.slice(0, MAX_CUSTOM_TICKERS);
  const rank = new Map([...new Set([...mine, ...(TICKER_GROUPS[group] ?? TICKER_GROUPS[DEFAULT_GROUP])])].map((t, i) => [t, i]));
  const byDate = new Map(dates.map(d => [d, { macro: [], earn: [] }]));
  // no_result: events that never get a result on screen (FOMC minutes, ISM).
  const base = { sep: false, eps: null, result: null, verdict: null, no_result: false };
  const add = (date, ev) => { if (inWeek.has(date)) byDate.get(date).macro.push({ ...base, ...ev }); };

  for (const r of releaseDates(fred)) {
    const rel = RELEASES[r.release_id];
    if (!inWeek.has(r.date) || (rel.tier === 2 && !allTracked)) continue;
    const list = byDate.get(r.date).macro;
    if (list.some(e => e.label === rel.label)) continue;
    const result = macroResult(rel, series[rel.series], r.date);
    if (result && rel.extra) result.extra = extraResult(rel.extra, series[rel.extra.series], r.date);
    list.push({ ...base, kind: 'macro', label: rel.label, time: rel.time, major: rel.tier === 1, _at: hhmm(rel.time), _tie: rel.tier, result });
  }

  for (const f of FOMC) {
    add(f.date, { kind: 'fomc', label: 'FOMC', time: '2:00', major: true, sep: f.sep, _at: '1400', _tie: 0,
      result: fomcResult(series[FED_TARGET.upper], series[FED_TARGET.lower], f.date) });
    if (allTracked) {
      add(FOMC_MINUTES_OVERRIDES[f.date] ?? addDays(f.date, FOMC_MINUTES_LAG_DAYS),
        { kind: 'minutes', label: 'FOMC Minutes', time: '2:00', major: false, no_result: true, _at: '1400', _tie: 2 });
    }
  }

  if (allTracked) {
    for (const month of new Set(dates.map(d => d.slice(0, 7)))) {
      for (const ism of ISM) {
        add(nthBusinessDay(month, ism.businessDay, MARKET_CLOSED),
          { kind: 'ism', label: ism.label, time: ism.time, major: false, no_result: true, _at: hhmm(ism.time), _tie: 2 });
      }
    }
    for (const a of auctions ?? []) {
      const term = a.originalSecurityTerm || a.securityTerm;
      const date = String(a.competitiveAuctionCloseDate ?? '').slice(0, 10);
      if (!['Note', 'Bond'].includes(a.securityType) || a.inflationProtected === 'Yes' || a.floatingRate === 'Yes') continue;
      if (!AUCTION_TERMS.includes(term) || !inWeek.has(date)) continue;
      const label = `${Number.parseInt(term, 10)}Y Auction`;
      if (byDate.get(date).macro.some(e => e.label === label)) continue;
      const { time, at } = auctionTime(a.competitiveAuctionCloseTime);
      add(date, { kind: 'auction', label, time, major: false, _at: at, _tie: 2, result: auctionResult(a) });
    }
  }

  for (const row of earnings ?? []) {
    const e = { ...row, symbol: SYMBOL_ALIASES[row.symbol] ?? row.symbol };
    if (!rank.has(e.symbol) || !inWeek.has(e.date)) continue;
    const list = byDate.get(e.date).earn;
    if (list.some(x => x.label === e.symbol)) continue;
    const h = HOURS[e.hour] ?? TBD;
    const result = earningsResult(e);
    list.push({ ...base, kind: 'earn', label: e.symbol, time: h.label, major: false, _at: h.at, _tie: 3 + rank.get(e.symbol), _rank: rank.get(e.symbol),
      eps: typeof e.epsEstimate === 'number' ? e.epsEstimate.toFixed(2) : null,
      result, verdict: result?.verdict ?? null });
  }

  // Schedules are kept in ET; move each event to the viewer's clock. Earnings keep BMO / AMC.
  for (const [date, { macro, earn }] of byDate) {
    for (const e of [...macro, ...earn]) {
      if (e._at === TBD.at) continue; // TBD stays last in the day
      e._at = fromET(date, e._at, tz);
      if (e.kind !== 'earn' && tz !== TIME_ZONES[DEFAULT_ZONE].tz) e.time = clock(e._at, h24);
    }
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
  }).map(d => {
    // The full layout's columns are short: show only the earnings that fit there.
    const fit = fullLayoutFit(d);
    return { ...d, full_earnings: fit, full_more: d.earnings_more + d.earnings.length - fit };
  });

  const all = days.flatMap(d => [...d.events, ...d.earnings].sort(order));
  const upcoming = all.filter(e => e.status === 'future');
  const latest = all.filter(e => e.status === 'past' && e.result).reverse().slice(0, LATEST_LIMIT);
  // Next up skips result-less events (minutes, ISM) unless nothing else is left.
  const head = upcoming.find(e => !e.no_result) ?? upcoming[0];
  const next = head ? { ...head, when: whenLabel(head, today) } : null;

  const strip = ({ _at, _tie, _rank, ...e }) => e;
  return {
    generated_at: generatedAt,
    today,
    week_label: weekLabel(dates),
    scope: allTracked ? 'all_tracked_releases' : 'headline_only',
    group: TICKER_GROUPS[group] ? group : DEFAULT_GROUP,
    tickers: mine,
    zone: TIME_ZONES[zone] ? zone : DEFAULT_ZONE,
    tz_label: tzLabel,
    auctions_ok: Array.isArray(auctions),
    macro_ok: Array.isArray(fred),
    earnings_ok: Array.isArray(earnings),
    next: next && strip(next),
    latest: latest.map(strip),
    // Next up first, so layouts can skip it with offset: 1.
    upcoming: (head ? [head, ...upcoming.filter(e => e !== head)] : upcoming).slice(0, UPCOMING_LIMIT).map(strip),
    days: days.map(d => ({ ...d, events: d.events.map(strip), earnings: d.earnings.map(strip) })),
  };
}

// 'Today 8:30', 'Tomorrow AMC', 'Thu 2:00'. Day-level wording stays true between hourly refreshes.
function whenLabel(e, today) {
  const day = e.date === today ? 'Today' : e.date === addDays(today, 1) ? 'Tomorrow' : e.dow;
  return `${day} ${e.time}`;
}

// TreasuryDirect close time '01:00 PM' -> { time: '1:00', at: '1300' }.
function auctionTime(raw) {
  const m = /^(\d{1,2}):(\d{2}) ?([AP]M)$/i.exec(String(raw ?? '').trim());
  if (!m) return { time: '1:00', at: '1300' };
  const h24 = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return { time: `${Number(m[1])}:${m[2]}`, at: `${String(h24).padStart(2, '0')}${m[2]}` };
}

// Hand-kept tables that run out within CONFIG_WARN_DAYS. Empty = all good.
export function configWarnings(today) {
  const horizon = addDays(today, CONFIG_WARN_DAYS);
  const warnings = [];
  const lastFomc = FOMC.at(-1).date;
  if (lastFomc < horizon) warnings.push(`FOMC dates end ${lastFomc}: add the next year from federalreserve.gov`);
  const lastClosed = [...MARKET_CLOSED].sort().at(-1);
  if (lastClosed < horizon) warnings.push(`NYSE holidays end ${lastClosed}: add the next year from nyse.com`);
  return warnings;
}

// Estimated height (px) of one card in a full-layout day column. Measured from renders with the
// 12 / 16 / 21 px fonts; a label plus time longer than ~17 characters wraps to two lines.
const LINE = 19, SMALL = 14, GAP = 4, COLUMN_BUDGET = 300;
function cardHeight(e) {
  const name = (e.label.length + e.time.length > 17 ? 2 : 1) * LINE;
  if (e.kind === 'earn') return name + (e.result ? LINE + (e.result.rev ? SMALL : 0) : e.eps ? SMALL : 0) + GAP;
  if (e.no_result) return name + GAP;
  if (!e.result) return name + (e.status === 'past' ? SMALL : 0) + GAP;
  if (e.kind === 'fomc') return name + LINE + SMALL + GAP;
  return name + LINE + (e.result.extra ? SMALL : 0) + GAP;
}

// How many of the day's earnings fit under its events in a full-layout column (may be 0: then
// the column shows just the heading and "+N more").
function fullLayoutFit(d) {
  let used = (d.market === 'open' ? 0 : LINE + GAP) + d.events.reduce((sum, e) => sum + cardHeight(e), 0);
  if (!d.earnings.length) return 0;
  used += LINE + GAP; // "Earnings" heading
  let n = 0;
  for (const e of d.earnings) {
    const more = n + 1 < d.earnings.length || d.earnings_more > 0 ? SMALL + GAP : 0;
    if (used + cardHeight(e) + more > COLUMN_BUDGET) break;
    used += cardHeight(e);
    n++;
  }
  return n;
}

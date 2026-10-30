// Checks the live FRED and Finnhub APIs against what the server assumes.
// Usage (from server/): FRED_API_KEY=... FINNHUB_API_KEY=... node scripts/verify.mjs
// Prints PASS / WARN / FAIL per check. Never prints the keys.
import { fetchFred, fetchSeries, fetchEarnings } from '../src/sources.js';
import { RELEASES, FED_TARGET, TICKERS, SYMBOL_ALIASES } from '../src/config.js';
import { todayET, addDays } from '../src/dates.js';
import { macroResult } from '../src/results.js';

const { FRED_API_KEY, FINNHUB_API_KEY } = process.env;
let failed = 0;
const report = (status, msg) => { if (status === 'FAIL') failed++; console.log(`${status.padEnd(4)} ${msg}`); };
const today = todayET();

if (FRED_API_KEY) {
  // 1. Future release dates come back.
  try {
    const rows = await fetchFred({ apiKey: FRED_API_KEY, from: today, to: addDays(today, 30) });
    const ours = rows.filter(r => RELEASES[r.release_id]);
    const future = ours.filter(r => r.date > today);
    report(future.length ? 'PASS' : 'FAIL', `FRED release calendar: ${ours.length} tracked releases in the next 30 days, ${future.length} in the future`);
    for (const [id, rel] of Object.entries(RELEASES)) {
      if (!ours.some(r => String(r.release_id) === id)) report('WARN', `  no ${rel.label} (release ${id}) in the next 30 days; check the id if it should be monthly`);
    }
  } catch (err) { report('FAIL', `FRED release calendar: ${err.message}`); }

  // 2. Each result series exists, and the vintage window marks the newest value with its real publication date.
  for (const rel of Object.values(RELEASES)) {
    try {
      const recent = await fetchSeries({ apiKey: FRED_API_KEY, seriesId: rel.series, since: addDays(today, -45) });
      const newest = recent[0];
      if (!newest) { report('FAIL', `${rel.series} (${rel.label}): no observations`); continue; }
      const dated = newest.realtime_start > addDays(today, -45);
      const published = newest.realtime_start;
      const res = macroResult(rel, recent, published);
      report(dated ? 'PASS' : 'WARN', `${rel.series} (${rel.label}): newest ${newest.date} published ${published}${res ? `, shows ${res.value} ${res.unit} prev ${res.prev}` : ''}${dated ? '' : ' (nothing new in 45 days?)'}`);
    } catch (err) { report('FAIL', `${rel.series} (${rel.label}): ${err.message}`); }
  }
  for (const id of Object.values(FED_TARGET)) {
    try {
      const obs = await fetchSeries({ apiKey: FRED_API_KEY, seriesId: id, limit: 3 });
      report(obs.length ? 'PASS' : 'FAIL', `${id}: latest ${obs[0]?.date} = ${obs[0]?.value}`);
    } catch (err) { report('FAIL', `${id}: ${err.message}`); }
  }
} else report('WARN', 'FRED_API_KEY not set; FRED checks skipped');

if (FINNHUB_API_KEY) {
  // 3. Whole-market calendar, field names, our tickers' spelling, and actuals after reports.
  try {
    const rows = await fetchEarnings({ apiKey: FINNHUB_API_KEY, from: addDays(today, -60), to: addDays(today, 30) });
    report(rows.length > 100 ? 'PASS' : 'WARN', `Finnhub calendar without symbol: ${rows.length} rows over 90 days`);
    const fields = ['date', 'symbol', 'hour', 'epsEstimate', 'epsActual'];
    const missing = fields.filter(f => rows.length && !(f in rows[0]));
    report(missing.length ? 'FAIL' : 'PASS', `Finnhub fields ${missing.length ? `missing: ${missing.join(', ')}` : 'present: ' + fields.join(', ')}`);
    const seen = new Set(rows.map(r => SYMBOL_ALIASES[r.symbol] ?? r.symbol));
    const absent = TICKERS.filter(t => !seen.has(t));
    report(absent.length > 8 ? 'WARN' : 'PASS', `Tickers found: ${TICKERS.length - absent.length}/${TICKERS.length}${absent.length ? ` (absent: ${absent.join(', ')}; check spelling, Berkshire is listed as BRK.A, aliased in config)` : ''}`);
    const past = rows.filter(r => TICKERS.includes(r.symbol) && r.date < addDays(today, -2));
    const withActual = past.filter(r => r.epsActual != null);
    report(past.length && withActual.length === past.length ? 'PASS' : 'WARN', `epsActual filled for ${withActual.length}/${past.length} past reports of our tickers`);
  } catch (err) { report('FAIL', `Finnhub: ${err.message} (a 403 usually means the plan lacks this endpoint)`); }
} else report('WARN', 'FINNHUB_API_KEY not set; Finnhub checks skipped');

process.exitCode = failed ? 1 : 0;

// Turns raw upstream data into display-ready results. All output strings are ASCII.

const signed = (v, dp) => `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;

const observations = obs => (obs ?? []).filter(o => o.value !== '.').map(o => ({ ...o, v: Number(o.value) }));

const dirOf = (cur, prev) => (cur === prev ? 'flat' : Number(cur) > Number(prev) ? 'up' : 'down');

/**
 * Macro release result from a FRED series (newest observation first), or null if the
 * observation published on/after the release date isn't there yet.
 * -> { value: '+0.3%', unit: 'm/m', prev: '+0.2%', dir: 'up' | 'down' | 'flat' }
 */
export function macroResult(rel, obs, releaseDate) {
  const o = observations(obs);
  if (!o.length || o[0].realtime_start < releaseDate) return null;
  const [a, b, c] = o;
  let cur, prev, fmt;
  switch (rel.format) {
    case 'mom':
      if (!c) return null;
      [cur, prev, fmt] = [(a.v / b.v - 1) * 100, (b.v / c.v - 1) * 100, v => `${signed(v, 1)}%`];
      break;
    case 'pct':
      if (!b) return null;
      [cur, prev, fmt] = [a.v, b.v, v => `${signed(v, 1)}%`];
      break;
    case 'change_k':
      if (!c) return null;
      [cur, prev, fmt] = [a.v - b.v, b.v - c.v, v => `${signed(v, 0)}K`];
      break;
    case 'level':
      if (!b) return null;
      [cur, prev, fmt] = [a.v / rel.div, b.v / rel.div, v => `${v.toFixed(rel.dp)}${rel.suffix}`];
      break;
    default:
      return null;
  }
  const [value, prevValue] = [fmt(cur), fmt(prev)];
  // Compare what's displayed, so two values that both show "+0.3%" read as flat.
  const num = s => Number(s.replace(/[^0-9.-]/g, ''));
  return { value, unit: rel.unit, prev: prevValue, dir: value === prevValue ? 'flat' : dirOf(num(value), num(prevValue)) };
}

/**
 * FOMC decision from the daily fed funds target range series.
 * -> { value: 'CUT 25BP' | 'HOLD' | 'HIKE 50BP', unit: '3.75-4.00%', prev: null, dir }
 * Null until FRED has an observation dated after the decision day.
 */
export function fomcResult(upperObs, lowerObs, decisionDate) {
  const up = observations(upperObs);
  const lo = observations(lowerObs);
  const after = up.find(o => o.date > decisionDate);
  const before = up.find(o => o.date <= decisionDate);
  const lower = lo.find(o => o.date === after?.date);
  if (!after || !before || !lower) return null;
  const bp = Math.round((after.v - before.v) * 100);
  return {
    value: bp === 0 ? 'HOLD' : `${bp < 0 ? 'CUT' : 'HIKE'} ${Math.abs(bp)}BP`,
    unit: `${lower.v.toFixed(2)}-${after.v.toFixed(2)}%`,
    prev: null,
    dir: bp === 0 ? 'flat' : bp < 0 ? 'down' : 'up',
  };
}

/**
 * Earnings result from a Finnhub calendar row, or null before the report.
 * -> { value: '1.85', unit: 'EPS', prev: '1.75' (estimate), verdict: 'beat' | 'miss' | 'inline' | null }
 */
export function earningsResult(row) {
  if (typeof row.epsActual !== 'number') return null;
  const est = typeof row.epsEstimate === 'number' ? row.epsEstimate : null;
  const diff = est === null ? null : Math.round((row.epsActual - est) * 100);
  return {
    value: row.epsActual.toFixed(2),
    unit: 'EPS',
    prev: est === null ? null : est.toFixed(2),
    verdict: diff === null ? null : diff > 0 ? 'beat' : diff < 0 ? 'miss' : 'inline',
  };
}

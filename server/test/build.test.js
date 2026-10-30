import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek, seriesNeeded } from '../src/build.js';
import { todayET, timeET, weekDays, weekLabel } from '../src/dates.js';

// Week of Mon Oct 26 - Fri Oct 30, 2026. "Now" is Thu Oct 29, 12:00 ET.
const fred = [
  { release_id: 101, date: '2026-10-28' }, // not allowlisted
  { release_id: 10, date: '2026-10-27' },
  { release_id: 53, date: '2026-10-29' },
  { release_id: 180, date: '2026-10-29' },
  { release_id: 54, date: '2026-10-30' },
  { release_id: 91, date: '2026-10-30' },
  { release_id: 50, date: '2026-11-06' }, // next week
];
const obs = (date, value, realtime_start) => ({ date, value: String(value), realtime_start });
const series = {
  CPIAUCSL: [obs('2026-09-01', 320.96, '2026-10-27'), obs('2026-08-01', 320, '2026-09-11'), obs('2026-07-01', 319.36, '2026-08-12')],
  A191RL1Q225SBEA: [obs('2026-07-01', 2.8, '2026-10-29'), obs('2026-04-01', 3.1, '2026-09-25')],
  ICSA: [obs('2026-10-24', 218000, '2026-10-29'), obs('2026-10-17', 225000, '2026-10-22')],
  DFEDTARU: [obs('2026-10-29', 4.0, '2026-10-29'), obs('2026-10-28', 4.25, '2026-10-28'), obs('2026-10-27', 4.25, '2026-10-27')],
  DFEDTARL: [obs('2026-10-29', 3.75, '2026-10-29'), obs('2026-10-28', 4.0, '2026-10-28')],
};
const earn = (symbol, date, hour, epsEstimate = null, epsActual = null) => ({ symbol, date, hour, epsEstimate, epsActual });
const earnings = [
  earn('GOOGL', '2026-10-27', 'amc', 2.05, 2.05),
  earn('MSFT', '2026-10-28', 'amc', 3.1, 3.3),
  earn('META', '2026-10-28', 'amc', 6.72, 6.5),
  earn('ZZZZ', '2026-10-28', 'amc', 1, 2), // not curated
  earn('AAPL', '2026-10-29', 'amc', 1.7531),
  earn('AMZN', '2026-10-29', 'amc'),
  // 6 curated tickers on Friday: only the top 4 by rank show
  ...['MU', 'FDX', 'NVDA', 'XOM', 'JPM', 'CAT'].map(s => earn(s, '2026-10-30', s === 'JPM' ? 'bmo' : 'amc')),
];

const week = buildWeek({ fred, earnings, series, today: '2026-10-29', now: '1200', generatedAt: 'x' });
const day = d => week.days.find(x => x.date === d);
const labels = list => list.map(e => e.label);

test('calendar week Mon-Fri with past / today / future', () => {
  assert.deepEqual(week.days.map(d => `${d.dow} ${d.day} ${d.status}`),
    ['Mon 26 past', 'Tue 27 past', 'Wed 28 past', 'Thu 29 today', 'Fri 30 future']);
  assert.equal(week.week_label, 'Oct 26 - 30');
  assert.equal(day('2026-10-29').is_today, true);
});

test('Saturday recaps the week that ended, Sunday previews the next', () => {
  assert.equal(weekDays('2026-10-31')[0], '2026-10-26');
  assert.equal(weekDays('2026-11-01')[0], '2026-11-02');
  assert.equal(weekLabel(weekDays('2026-11-29')), 'Nov 30 - Dec 4');
});

test('only allowlisted releases in the week, headline first on ties', () => {
  assert.deepEqual(labels(day('2026-10-29').events), ['GDP', 'Jobless Claims']);
  assert.deepEqual(day('2026-10-30').events.map(e => `${e.time} ${e.label}`), ['8:30 PCE', '10:00 UMich Sentiment']);
  assert.ok(!week.days.some(d => d.events.some(e => e.label === 'Jobs Report')));
  assert.deepEqual(day('2026-10-29').events.map(e => e.major), [true, false]);
});

test('macro results with prior and direction', () => {
  assert.deepEqual(day('2026-10-27').events[0].result, { value: '+0.3%', unit: 'm/m', prev: '+0.2%', dir: 'up' });
  assert.deepEqual(day('2026-10-29').events[0].result, { value: '+2.8%', unit: 'q/q ann.', prev: '+3.1%', dir: 'down' });
  assert.deepEqual(day('2026-10-29').events[1].result, { value: '218K', unit: 'initial', prev: '225K', dir: 'down' });
  assert.equal(day('2026-10-30').events[0].result, null); // not released yet
});

test('FOMC decision result and SEP flag', () => {
  const fomc = day('2026-10-28').events[0];
  assert.equal(fomc.kind, 'fomc');
  assert.equal(fomc.sep, false);
  assert.deepEqual(fomc.result, { value: 'CUT 25BP', unit: '3.75-4.00%', prev: null, dir: 'down' });
  const dec = buildWeek({ fred: [], earnings: [], today: '2026-12-07' });
  assert.equal(dec.days.find(d => d.date === '2026-12-09').events[0].sep, true);
});

test('earnings: curated only, estimate before, verdict after', () => {
  const wed = day('2026-10-28').earnings;
  assert.deepEqual(wed.map(e => [e.label, e.result.value, e.verdict]), [['MSFT', '3.30', 'beat'], ['META', '6.50', 'miss']]);
  assert.equal(day('2026-10-27').earnings[0].verdict, 'inline');
  const aapl = day('2026-10-29').earnings[0];
  assert.deepEqual([aapl.label, aapl.time, aapl.eps, aapl.result, aapl.status], ['AAPL', 'AMC', '1.75', null, 'future']);
});

test('busy day keeps the top 4 by rank, in time order, and counts the rest', () => {
  const fri = day('2026-10-30');
  assert.deepEqual(labels(fri.earnings), ['JPM', 'NVDA', 'XOM', 'CAT']); // JPM is BMO, so first
  assert.equal(fri.earnings_more, 2); // FDX and MU rank lowest
});

test('next, latest and upcoming', () => {
  assert.equal(week.next.label, 'AAPL');
  assert.equal(week.next.when, 'Today AMC');
  assert.deepEqual(labels(week.latest), ['Jobless Claims', 'GDP', 'META', 'MSFT', 'FOMC', 'GOOGL']);
  assert.deepEqual(labels(week.upcoming).slice(0, 4), ['AAPL', 'AMZN', 'JPM', 'PCE']); // JPM reports before the open, ahead of PCE at 8:30
  assert.ok(week.upcoming.every(e => e.status === 'future'));
  const early = buildWeek({ fred, earnings, series, today: '2026-10-28', now: '0900' });
  assert.equal(early.next.when, 'Today 2:00');
  const fri = buildWeek({ fred, earnings, series, today: '2026-10-29', now: '1700' });
  assert.equal(fri.next.when, 'Tomorrow BMO');
});

test('headline_only scope drops tier-2 releases but keeps FOMC', () => {
  const h = buildWeek({ fred, earnings, series, today: '2026-10-29', now: '1200', scope: 'headline_only' });
  assert.deepEqual(h.days.flatMap(d => labels(d.events)), ['CPI', 'FOMC', 'GDP', 'PCE']);
  assert.equal(h.scope, 'headline_only');
});

test('market holidays and early closes are flagged', () => {
  const t = buildWeek({ fred: [], earnings: [], today: '2026-11-23' });
  assert.deepEqual(t.days.map(d => d.market), ['open', 'open', 'open', 'closed', 'early_close']);
});

test('failed sources hide their section but keep FOMC', () => {
  const w = buildWeek({ fred: null, earnings: null, today: '2026-10-29', now: '1200' });
  assert.equal(w.macro_ok, false);
  assert.equal(w.earnings_ok, false);
  assert.deepEqual(w.days.flatMap(d => labels(d.events)), ['FOMC']);
  assert.equal(w.next, null);
});

test('only series for releases already due are fetched', () => {
  const need = Object.fromEntries(seriesNeeded({ fred, today: '2026-10-29' }).map(s => [s.id, s.since]));
  assert.deepEqual(need, { CPIAUCSL: '2026-10-26', A191RL1Q225SBEA: '2026-10-28', ICSA: '2026-10-28', DFEDTARU: null, DFEDTARL: null });
  assert.deepEqual(seriesNeeded({ fred: null, today: '2026-10-26' }), []);
});

test('today and time are computed in ET, not UTC', () => {
  assert.equal(todayET(new Date('2026-10-29T02:00:00Z')), '2026-10-28'); // 10 PM ET
  assert.equal(todayET(new Date('2026-10-29T05:00:00Z')), '2026-10-29');
  assert.equal(timeET(new Date('2026-10-29T12:30:00Z')), '0830');
});

test('Berkshire is listed as BRK.A in the calendar and shown as BRK.B', () => {
  const week = buildWeek({ fred: [], earnings: [{ symbol: 'BRK.A', date: '2026-10-30', hour: 'bmo', epsEstimate: 5 }], today: '2026-10-29', now: '1200' });
  assert.deepEqual(week.days[4].earnings.map(e => e.label), ['BRK.B']);
});

test('a repeat Housing Starts date within 12 days is dropped', () => {
  const fred = [{ release_id: 27, date: '2026-10-20' }, { release_id: 27, date: '2026-10-27' }, { release_id: 27, date: '2026-11-18' }];
  const oct = buildWeek({ fred, earnings: [], today: '2026-10-29', now: '1200' });
  assert.ok(oct.days.every(d => !d.events.some(e => e.label === 'Housing Starts')));
  const nov = buildWeek({ fred, earnings: [], today: '2026-11-18', now: '1200' });
  assert.deepEqual(nov.days[2].events.map(e => e.label), ['Housing Starts']);
  assert.ok(!seriesNeeded({ fred, today: '2026-10-29' }).some(s => s.id === 'HOUST'));
});

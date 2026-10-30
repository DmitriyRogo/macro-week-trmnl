import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek, seriesNeeded, configWarnings, parseTickers } from '../src/build.js';
import { earningsResult, auctionResult } from '../src/results.js';
import { nthBusinessDay, todayET } from '../src/dates.js';
import { MARKET_CLOSED } from '../src/config.js';

const obs = (date, value, realtime_start = 'x') => ({ date, value: String(value), realtime_start });
const labels = list => list.map(e => e.label);

test('second numbers: core CPI and unemployment under the headline', () => {
  const series = {
    CPIAUCSL: [obs('2026-09-01', 320.96, '2026-10-27'), obs('2026-08-01', 320), obs('2026-07-01', 319.36)],
    CPILFESL: [obs('2026-09-01', 330.99, '2026-10-27'), obs('2026-08-01', 330), obs('2026-07-01', 329)],
    PAYEMS: [obs('2026-10-01', 159700, '2026-11-06'), obs('2026-09-01', 159550), obs('2026-08-01', 159400)],
    UNRATE: [obs('2026-10-01', 4.3, '2026-11-06'), obs('2026-09-01', 4.2)],
  };
  const oct = buildWeek({ fred: [{ release_id: 10, date: '2026-10-27' }], earnings: [], series, today: '2026-10-29', now: '1200' });
  assert.deepEqual(oct.days[1].events[0].result.extra, { label: 'core', value: '+0.3%' });
  const nov = buildWeek({ fred: [{ release_id: 50, date: '2026-11-06' }], earnings: [], series, today: '2026-11-06', now: '1200' });
  assert.deepEqual(nov.days[4].events[0].result.extra, { label: 'unemp.', value: '4.3%' });
  const need = seriesNeeded({ fred: [{ release_id: 50, date: '2026-11-06' }], today: '2026-11-06' }).map(s => s.id);
  assert.deepEqual(need, ['PAYEMS', 'UNRATE']);
});

test('a stale second number is left out, not shown as new', () => {
  const series = {
    CPIAUCSL: [obs('2026-09-01', 320.96, '2026-10-27'), obs('2026-08-01', 320), obs('2026-07-01', 319.36)],
    CPILFESL: [obs('2026-08-01', 330, '2026-10-26'), obs('2026-07-01', 329), obs('2026-06-01', 328)],
  };
  const w = buildWeek({ fred: [{ release_id: 10, date: '2026-10-27' }], earnings: [], series, today: '2026-10-29', now: '1200' });
  assert.equal(w.days[1].events[0].result.extra, null);
});

test('revenue next to EPS', () => {
  assert.deepEqual(earningsResult({ epsActual: 1.89, epsEstimate: 2, revenueActual: 180.2e9, revenueEstimate: 177e9 }).rev, { value: '180.2B', verdict: 'beat' });
  assert.equal(earningsResult({ epsActual: 1, epsEstimate: 1, revenueActual: 99.8e6, revenueEstimate: 100e6 }).rev.verdict, 'inline');
  assert.deepEqual(earningsResult({ epsActual: 1, revenueActual: 850e6 }).rev, { value: '850M', verdict: null });
  assert.equal(earningsResult({ epsActual: 1, epsEstimate: 1, revenueActual: 0 }).rev, null);
});

test('FOMC minutes three weeks after the decision; ISM on business days 1 and 3', () => {
  const w = buildWeek({ fred: [], earnings: [], today: '2026-11-18', now: '0900' });
  assert.deepEqual(w.days[2].events.map(e => [e.label, e.time, e.no_result]), [['FOMC Minutes', '2:00', true]]);
  const nov = buildWeek({ fred: [], earnings: [], today: '2026-11-02', now: '0900' });
  assert.deepEqual(nov.days.map(d => labels(d.events)), [['ISM Mfg'], [], ['ISM Services'], [], []]);
  assert.equal(nthBusinessDay('2027-01', 1, MARKET_CLOSED), '2027-01-04'); // Jan 1 holiday, then a weekend
  const h = buildWeek({ fred: [], earnings: [], today: '2026-11-02', scope: 'headline_only' });
  assert.ok(h.days.every(d => d.events.length === 0));
});

test('Treasury auctions: nominal coupons only, yield and cover once auctioned', () => {
  const row = (securityType, term, date, extra = {}) => ({
    securityType, originalSecurityTerm: term, securityTerm: term, competitiveAuctionCloseDate: `${date}T00:00:00`,
    competitiveAuctionCloseTime: '01:00 PM', inflationProtected: 'No', floatingRate: 'No', highYield: '', bidToCoverRatio: '', ...extra,
  });
  const auctions = [
    row('Note', '7-Year', '2026-10-29', { highYield: '4.894', bidToCoverRatio: '2.46' }),
    row('Note', '5-Year', '2026-10-28', { highYield: '4.845', bidToCoverRatio: '2.33' }),
    row('Note', '2-Year', '2026-10-27', { floatingRate: 'Yes', competitiveAuctionCloseTime: '11:30 AM' }), // FRN
    row('Note', '5-Year', '2026-10-27', { inflationProtected: 'Yes' }), // TIPS
    row('Bill', '13-Week', '2026-10-26'),
    row('Bond', '30-Year', '2026-10-30'),
  ];
  const w = buildWeek({ fred: [], earnings: [], auctions, today: '2026-10-29', now: '1400' });
  assert.deepEqual(w.days.map(d => labels(d.events)), [[], [], ['5Y Auction', 'FOMC'], ['7Y Auction'], ['30Y Auction']]);
  assert.deepEqual(w.days[3].events[0].result, { value: '4.894%', unit: 'yield', prev: null, cover: '2.46x', dir: null });
  assert.equal(w.days[4].events[0].result, null);
  assert.equal(w.auctions_ok, true);
  assert.equal(auctionResult({ highYield: '' }), null);
});

test('ticker groups pick and rank the earnings shown', () => {
  const e = (symbol, date) => ({ symbol, date, hour: 'amc', epsEstimate: 1 });
  const earnings = [e('AAPL', '2026-10-29'), e('WFC', '2026-10-29'), e('JPM', '2026-10-29'), e('KO', '2026-10-29')];
  const pick = group => labels(buildWeek({ fred: [], earnings, today: '2026-10-29', group }).days[3].earnings);
  assert.deepEqual(pick('market_leaders'), ['AAPL', 'JPM']);
  assert.deepEqual(pick('big_banks'), ['JPM', 'WFC']);
  assert.deepEqual(pick('dow_30'), ['AAPL', 'JPM', 'KO']);
  assert.deepEqual(pick('nonsense'), ['AAPL', 'JPM']);
});

test('Next up skips result-less events but upcoming keeps them', () => {
  const earnings = [{ symbol: 'NVDA', date: '2026-11-18', hour: 'amc', epsEstimate: 1.1 }];
  const w = buildWeek({ fred: [], earnings, today: '2026-11-18', now: '0900' });
  assert.equal(w.next.label, 'NVDA'); // minutes at 2:00 come first but have no result
  assert.deepEqual(labels(w.upcoming), ['NVDA', 'FOMC Minutes']);
  const late = buildWeek({ fred: [], earnings: [], today: '2026-11-18', now: '0900' });
  assert.equal(late.next.label, 'FOMC Minutes'); // nothing else left this week
});

// Fails when a hand-kept table is about to run out: update server/src/config.js.
test('FOMC and holiday tables cover the next 60 days', () => {
  assert.deepEqual(configWarnings(todayET()), []);
  assert.equal(configWarnings('2027-11-01').length, 2);
});

test('full layout shows only the earnings that fit under a busy day', () => {
  const e = (symbol, hour) => ({ symbol, date: '2026-10-29', hour, epsEstimate: 1, epsActual: 1.1, revenueEstimate: 1e9, revenueActual: 1.1e9 });
  const earnings = [e('AAPL', 'amc'), e('AMZN', 'amc'), e('LLY', 'bmo'), e('MA', 'bmo'), e('V', 'amc')];
  const quiet = buildWeek({ fred: [], earnings, today: '2026-10-29', now: '2000' }).days[3];
  assert.deepEqual([quiet.full_earnings, quiet.full_more, quiet.earnings_more], [4, 1, 1]);
  const fred = [10, 53, 54, 180].map(release_id => ({ release_id, date: '2026-10-29' }));
  const busy = buildWeek({ fred, earnings, today: '2026-10-29', now: '0800' }).days[3];
  assert.ok(busy.full_earnings < 4);
  assert.equal(busy.full_earnings + busy.full_more, 5);
  assert.equal(busy.earnings.length, 4); // the list layouts still get the top 4
});

test('"Your tickers" come first, any US symbol, and only-mine drops the group', () => {
  assert.deepEqual(parseTickers(' nvda, brk-b;UBER  uber $$ 123 '), ['NVDA', 'BRK.B', 'UBER']);
  assert.equal(parseTickers(Array.from({ length: 15 }, (_, i) => `T${i}`).join(',')).length, 10);
  const earnings = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'UBER', 'SHOP'].map(symbol => ({ symbol, date: '2026-10-29', hour: 'amc', epsEstimate: 1 }));
  const mixed = buildWeek({ fred: [], earnings, today: '2026-10-28', now: '1200', tickers: ['SHOP', 'UBER'] });
  assert.deepEqual(labels(mixed.days[3].earnings).sort(), ['AAPL', 'MSFT', 'SHOP', 'UBER']);
  assert.equal(mixed.days[3].earnings_more, 2);
  assert.deepEqual(mixed.tickers, ['SHOP', 'UBER']);
  const mine = buildWeek({ fred: [], earnings, today: '2026-10-28', now: '1200', group: 'only_my_tickers', tickers: ['UBER'] });
  assert.deepEqual(labels(mine.days[3].earnings), ['UBER']);
  assert.equal(mine.days[3].earnings_more, 0);
});

test('times convert to the chosen zone, DST-aware; earnings keep BMO / AMC', () => {
  const fred = [{ release_id: 53, date: '2026-10-29' }];
  const earnings = [{ symbol: 'AAPL', date: '2026-10-29', hour: 'amc', epsEstimate: 1 }, { symbol: 'MSFT', date: '2026-10-29', hour: '', epsEstimate: 1 }];
  const at = (zone, today = '2026-10-28') => buildWeek({ fred, earnings, today, now: '1200', zone }).days[3];
  assert.equal(at('pacific').events[0].time, '5:30');
  assert.equal(at('london').events[0].time, '12:30'); // UK already on winter time, US not yet
  assert.equal(at('hawaii').events[0].time, '2:30');
  assert.equal(at('eastern').events[0].time, '8:30');
  assert.deepEqual(at('london').earnings.map(e => e.time), ['AMC', 'TBD']);
  assert.equal(buildWeek({ fred, earnings, today: '2026-10-28', zone: 'pacific' }).tz_label, 'PT');
  assert.equal(buildWeek({ fred, earnings, today: '2026-10-28', zone: 'nowhere' }).zone, 'eastern');
  // Status uses the viewer's clock: 8:30 ET has passed at 6:00 PT, not at 5:00 PT.
  assert.equal(buildWeek({ fred, earnings: [], today: '2026-10-29', now: '0500', zone: 'pacific' }).days[3].events[0].status, 'future');
  assert.equal(buildWeek({ fred, earnings: [], today: '2026-10-29', now: '0600', zone: 'pacific' }).days[3].events[0].status, 'past');
});

test('Friday evening shows next week', () => {
  const fred = [{ release_id: 50, date: '2026-11-06' }];
  assert.equal(buildWeek({ fred, earnings: [], today: '2026-10-30', now: '1700' }).week_label, 'Oct 26 - 30');
  const next = buildWeek({ fred, earnings: [], today: '2026-10-30', now: '1800' });
  assert.equal(next.week_label, 'Nov 2 - 6');
  assert.equal(next.next.label, 'Jobs Report');
  assert.ok(next.days.every(d => d.status === 'future'));
});

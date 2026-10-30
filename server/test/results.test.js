import { test } from 'node:test';
import assert from 'node:assert/strict';
import { macroResult, fomcResult, earningsResult } from '../src/results.js';
import { RELEASES } from '../src/config.js';

const obs = (date, value, realtime_start = '2026-11-06') => ({ date, value: String(value), realtime_start });

test('payrolls change in thousands', () => {
  const r = macroResult(RELEASES[50], [obs('2026-10-01', 159500), obs('2026-09-01', 159350), obs('2026-08-01', 159250)], '2026-11-06');
  assert.deepEqual(r, { value: '+150K', unit: 'payrolls', prev: '+100K', dir: 'up' });
});

test('levels with divisor and suffix', () => {
  const r = macroResult(RELEASES[192], [obs('2026-09-01', 7440), obs('2026-08-01', 7700)], '2026-11-06');
  assert.deepEqual(r, { value: '7.44M', unit: 'openings', prev: '7.70M', dir: 'down' });
});

test('same displayed value reads as flat', () => {
  const r = macroResult(RELEASES[10], [obs('c', 100.3), obs('b', 100.0), obs('a', 99.7)], '2026-11-06');
  assert.equal(r.dir, 'flat');
});

test('stale or missing observations give no result', () => {
  const stale = [obs('2026-08-01', 1, '2026-10-01'), obs('2026-07-01', 1), obs('2026-06-01', 1)];
  assert.equal(macroResult(RELEASES[10], stale, '2026-11-06'), null);
  assert.equal(macroResult(RELEASES[10], [], '2026-11-06'), null);
  assert.equal(macroResult(RELEASES[10], undefined, '2026-11-06'), null);
  assert.equal(macroResult(RELEASES[10], [obs('b', '.'), obs('a', 1)], '2026-11-06'), null);
});

test('FOMC hold and hike; pending until FRED has the next day', () => {
  const up = [obs('2026-12-10', 4.0), obs('2026-12-09', 4.0)];
  const lo = [obs('2026-12-10', 3.75), obs('2026-12-09', 3.75)];
  assert.deepEqual(fomcResult(up, lo, '2026-12-09'), { value: 'HOLD', unit: '3.75-4.00%', prev: null, dir: 'flat' });
  assert.equal(fomcResult([obs('2026-12-10', 4.5), obs('2026-12-09', 4.0)], [obs('2026-12-10', 4.25)], '2026-12-09').value, 'HIKE 50BP');
  assert.equal(fomcResult([obs('2026-12-09', 4.0)], [obs('2026-12-09', 3.75)], '2026-12-09'), null);
});

test('earnings verdicts', () => {
  assert.deepEqual(earningsResult({ epsActual: 1.85, epsEstimate: 1.75 }), { value: '1.85', unit: 'EPS', prev: '1.75', verdict: 'beat', rev: null });
  assert.equal(earningsResult({ epsActual: 1.7, epsEstimate: 1.75 }).verdict, 'miss');
  assert.equal(earningsResult({ epsActual: 1.751, epsEstimate: 1.75 }).verdict, 'inline');
  assert.equal(earningsResult({ epsActual: 1.7, epsEstimate: null }).verdict, null);
  assert.equal(earningsResult({ epsActual: null, epsEstimate: 1.75 }), null);
});

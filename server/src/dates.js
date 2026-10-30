import { TIME_ZONE } from './config.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Calendar dates are handled as 'YYYY-MM-DD' strings, anchored at noon UTC for arithmetic.
const toDate = d => new Date(`${d}T12:00:00Z`);

// Wall-clock parts of an instant in a time zone. One formatter per zone.
const formatters = new Map();
const wall = (tz, instant) => {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }
  const p = Object.fromEntries(formatters.get(tz).formatToParts(instant).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}${p.minute}` };
};

// Today's date and the 'HHMM' wall-clock time in a zone (default ET).
export const todayIn = (tz = TIME_ZONE, now = new Date()) => wall(tz, now).date;
export const timeIn = (tz = TIME_ZONE, now = new Date()) => wall(tz, now).time;
export const todayET = (now = new Date()) => todayIn(TIME_ZONE, now);
export const timeET = (now = new Date()) => timeIn(TIME_ZONE, now);

// An ET wall-clock time on a date ('2026-10-29', '0830') as 'HHMM' in another zone. DST-aware:
// ET and London change clocks on different weekends.
export const fromET = (date, hhmm, tz) => {
  if (tz === TIME_ZONE) return hhmm;
  const guess = Date.UTC(...date.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(2)));
  const offset = t => {
    const w = wall(TIME_ZONE, new Date(t));
    return Date.UTC(...w.date.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)), Number(w.time.slice(0, 2)), Number(w.time.slice(2))) - t;
  };
  const instant = guess - offset(guess - offset(guess));
  return wall(tz, new Date(instant)).time;
};

export const addDays = (d, n) => {
  const t = toDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export const dow = d => DOW[toDate(d).getUTCDay()];

// After this local time on Friday the screen moves on to next week (the market has closed and
// Friday's few after-close reports are rare).
export const WEEK_ROLLOVER = '1800';

// Mon-Fri of the week to show: the current week until Friday WEEK_ROLLOVER, then next week
// through the weekend, so people can see what's coming.
export const weekDays = (today, now = '0000') => {
  const w = toDate(today).getUTCDay();
  const ahead = w === 6 || w === 0 || (w === 5 && now >= WEEK_ROLLOVER);
  const monday = addDays(today, ahead ? (8 - w) % 7 : 1 - w);
  return [0, 1, 2, 3, 4].map(i => addDays(monday, i));
};

// 'Oct 26 - 30' or 'Oct 30 - Nov 3' (ASCII only: device pixel fonts may lack en dashes).
export const weekLabel = days => {
  const [a, b] = [toDate(days[0]), toDate(days[days.length - 1])];
  const left = `${MON[a.getUTCMonth()]} ${a.getUTCDate()}`;
  return a.getUTCMonth() === b.getUTCMonth() ? `${left} - ${b.getUTCDate()}` : `${left} - ${MON[b.getUTCMonth()]} ${b.getUTCDate()}`;
};

// The nth weekday of a month that isn't in `closed`: ISM publishes on business days 1 and 3.
export const nthBusinessDay = (yearMonth, n, closed = new Set()) => {
  let d = `${yearMonth}-01`;
  for (let seen = 0; ; d = addDays(d, 1)) {
    const w = toDate(d).getUTCDay();
    if (w !== 0 && w !== 6 && !closed.has(d) && ++seen === n) return d;
  }
};

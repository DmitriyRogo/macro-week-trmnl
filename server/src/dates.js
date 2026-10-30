import { TIME_ZONE } from './config.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Calendar dates are handled as 'YYYY-MM-DD' strings, anchored at noon UTC for arithmetic.
const toDate = d => new Date(`${d}T12:00:00Z`);

export const todayET = (now = new Date()) => ymd.format(now);

// Current ET wall-clock time as a sortable 'HHMM' string.
export const timeET = (now = new Date()) => hm.format(now).replace(':', '');

export const addDays = (d, n) => {
  const t = toDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export const dow = d => DOW[toDate(d).getUTCDay()];

// Mon-Fri of the week to show: the current week, except Sunday previews next week.
// (Saturday keeps the week that just ended, as a recap.)
export const weekDays = today => {
  const w = toDate(today).getUTCDay();
  const monday = addDays(today, w === 0 ? 1 : 1 - w);
  return [0, 1, 2, 3, 4].map(i => addDays(monday, i));
};

// 'Oct 26 - 30' or 'Oct 30 - Nov 3' (ASCII only: device pixel fonts may lack en dashes).
export const weekLabel = days => {
  const [a, b] = [toDate(days[0]), toDate(days[days.length - 1])];
  const left = `${MON[a.getUTCMonth()]} ${a.getUTCDate()}`;
  return a.getUTCMonth() === b.getUTCMonth() ? `${left} - ${b.getUTCDate()}` : `${left} - ${MON[b.getUTCMonth()]} ${b.getUTCDate()}`;
};

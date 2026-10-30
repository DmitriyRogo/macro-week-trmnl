// Everything that needs a periodic human update lives in this file.

// FRED release_id -> display info. IDs verified on https://fred.stlouisfed.org/releases (Oct 2026).
// Times are ET, per BLS / BEA / Census / DOL / UMich schedules; re-verify yearly.
// tier 1 = headline (bold, always shown), tier 2 = shown with scope "all_tracked_releases".
// series = FRED series whose newest observation is this release's result. format:
//   mom      % change vs prior period (index levels)      e.g. +0.3% m/m
//   pct      series is already a % rate                   e.g. +2.8% (GDP, q/q annualized)
//   change_k change vs prior period, in thousands         e.g. +150K
//   level    value / div, dp decimals, suffix              e.g. 218K, 7.44M, 70.5
export const RELEASES = {
  10: { label: 'CPI', time: '8:30', tier: 1, series: 'CPIAUCSL', format: 'mom', unit: 'm/m' }, //                 Consumer Price Index (BLS)
  46: { label: 'PPI', time: '8:30', tier: 1, series: 'PPIFIS', format: 'mom', unit: 'm/m' }, //                   Producer Price Index (BLS), final demand
  50: { label: 'Jobs Report', time: '8:30', tier: 1, series: 'PAYEMS', format: 'change_k', unit: 'payrolls' }, // Employment Situation (BLS)
  53: { label: 'GDP', time: '8:30', tier: 1, series: 'A191RL1Q225SBEA', format: 'pct', unit: 'q/q ann.' }, //    Gross Domestic Product (BEA)
  54: { label: 'PCE', time: '8:30', tier: 1, series: 'PCEPI', format: 'mom', unit: 'm/m' }, //                    Personal Income and Outlays (BEA), PCE price index
  9: { label: 'Retail Sales', time: '8:30', tier: 1, series: 'RSAFS', format: 'mom', unit: 'm/m' }, //            Advance Monthly Sales for Retail and Food Services (Census)
  192: { label: 'JOLTS', time: '10:00', tier: 2, series: 'JTSJOL', format: 'level', div: 1000, dp: 2, suffix: 'M', unit: 'openings' }, // Job Openings and Labor Turnover Survey (BLS)
  180: { label: 'Jobless Claims', time: '8:30', tier: 2, series: 'ICSA', format: 'level', div: 1000, dp: 0, suffix: 'K', unit: 'initial' }, // Unemployment Insurance Weekly Claims Report (DOL); 469 is the *state* report
  91: { label: 'UMich Sentiment', time: '10:00', tier: 2, series: 'UMCSENT', format: 'level', div: 1, dp: 1, suffix: '', unit: 'index' }, // Surveys of Consumers (University of Michigan)
  27: { label: 'Housing Starts', time: '8:30', tier: 2, series: 'HOUST', format: 'level', div: 1000, dp: 2, suffix: 'M', unit: 'ann. rate', minGapDays: 12 }, // New Residential Construction (Census). FRED also lists a second date about a week after each one that doesn't update starts; minGapDays drops it
};

// Fed funds target range (daily), used for the FOMC decision result.
export const FED_TARGET = { upper: 'DFEDTARU', lower: 'DFEDTARL' };

// FOMC decision days (second day of each meeting), 2:00 PM ET.
// Source: https://federalreserve.gov/monetarypolicy/fomccalendars.htm
// sep = meeting releases a Summary of Economic Projections.
// ⚠ 2027 dates are TENTATIVE until confirmed at the preceding meeting. Update yearly.
export const FOMC = [
  { date: '2026-10-28', sep: false },
  { date: '2026-12-09', sep: true },
  // 2027 (tentative)
  { date: '2027-01-27', sep: false },
  { date: '2027-03-17', sep: true },
  { date: '2027-04-28', sep: false },
  { date: '2027-06-09', sep: true },
  { date: '2027-07-28', sep: false },
  { date: '2027-09-15', sep: true },
  { date: '2027-10-27', sep: false },
  { date: '2027-12-08', sep: true },
];

// NYSE full closures and 1:00 PM early closes. Source: https://www.nyse.com/markets/hours-calendars
export const MARKET_CLOSED = new Set([
  '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
export const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

// Curated earnings list, in priority order. On a busy day only the first
// EARNINGS_PER_DAY reporting tickers are shown; the rest count toward "+N more".
// Review quarterly.
export const TICKERS = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO',
  // Index and sector movers
  'BRK.B', 'JPM', 'LLY', 'V', 'MA', 'WMT', 'COST', 'XOM', 'UNH', 'NFLX', 'ORCL',
  // Bellwethers
  'GS', 'BAC', 'HD', 'PG', 'JNJ', 'CAT', 'FDX', 'MU',
];
export const EARNINGS_PER_DAY = 4;

// Calendar symbol -> the ticker shown. Finnhub's whole-market calendar lists
// Berkshire only as BRK.A.
export const SYMBOL_ALIASES = { 'BRK.A': 'BRK.B' };

// Max items in the flat "upcoming" and "latest" lists used by the smaller layouts.
export const UPCOMING_LIMIT = 12;
export const LATEST_LIMIT = 6;

export const TIME_ZONE = 'America/New_York';

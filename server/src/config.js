// Everything that needs a periodic human update lives in this file.

// FRED release_id -> display info. IDs verified on https://fred.stlouisfed.org/releases (Oct 2026).
// Times are ET, per BLS / BEA / Census / DOL / UMich schedules; re-verify yearly.
// tier 1 = headline (bold, always shown), tier 2 = shown with scope "all_tracked_releases".
// series = FRED series whose newest observation is this release's result. format:
//   mom      % change vs prior period (index levels)      e.g. +0.3% m/m
//   pct      series is already a % rate                   e.g. +2.8% (GDP, q/q annualized)
//   change_k change vs prior period, in thousands         e.g. +150K
//   level    value / div, dp decimals, suffix              e.g. 218K, 7.44M, 70.5
// extra = a second number from the same release, shown under the headline (same formats).
export const RELEASES = {
  10: { label: 'CPI', time: '8:30', tier: 1, series: 'CPIAUCSL', format: 'mom', unit: 'm/m', extra: { label: 'core', series: 'CPILFESL', format: 'mom' } }, //                 Consumer Price Index (BLS)
  46: { label: 'PPI', time: '8:30', tier: 1, series: 'PPIFIS', format: 'mom', unit: 'm/m' }, //                   Producer Price Index (BLS), final demand
  50: { label: 'Jobs Report', time: '8:30', tier: 1, series: 'PAYEMS', format: 'change_k', unit: 'payrolls', extra: { label: 'unemp.', series: 'UNRATE', format: 'level', div: 1, dp: 1, suffix: '%' } }, // Employment Situation (BLS)
  53: { label: 'GDP', time: '8:30', tier: 1, series: 'A191RL1Q225SBEA', format: 'pct', unit: 'q/q ann.' }, //    Gross Domestic Product (BEA)
  54: { label: 'PCE', time: '8:30', tier: 1, series: 'PCEPI', format: 'mom', unit: 'm/m', extra: { label: 'core', series: 'PCEPILFE', format: 'mom' } }, //                    Personal Income and Outlays (BEA), PCE price index
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

// FOMC minutes come out three weeks after each decision, 2:00 PM ET. Computed from FOMC;
// the Fed occasionally moves one (check the calendar page above), so list exceptions here.
export const FOMC_MINUTES_LAG_DAYS = 21;
export const FOMC_MINUTES_OVERRIDES = {}; // { decisionDate: minutesDate }

// ISM PMIs, 10:00 AM ET: Manufacturing on the 1st business day of the month, Services on the
// 3rd. Dates only: the index values are licensed by ISM and not on FRED, so no result.
export const ISM = [
  { label: 'ISM Mfg', businessDay: 1, time: '10:00' },
  { label: 'ISM Services', businessDay: 3, time: '10:00' },
];

// Treasury coupon auctions shown (nominal notes and bonds; TIPS and FRNs skipped), from
// TreasuryDirect. Reopenings count under their original term (a "9-Year 10-Month" is a 10Y).
export const AUCTION_TERMS = ['2-Year', '5-Year', '7-Year', '10-Year', '20-Year', '30-Year'];

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

// Ticker groups for the "Companies" form field, each in priority order. Review quarterly.
// dow30: index members as of Oct 2026; S&P Dow Jones changes them a few times a year.
export const TICKER_GROUPS = {
  market_leaders: TICKERS,
  mega_cap_tech: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL', 'NFLX', 'AMD', 'CRM', 'ADBE', 'CSCO', 'QCOM', 'IBM', 'INTC', 'MU'],
  big_banks: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'SCHW', 'BLK', 'AXP', 'USB', 'PNC', 'COF', 'BK'],
  only_my_tickers: [],
  dow_30: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'JPM', 'V', 'WMT', 'UNH', 'HD', 'PG', 'JNJ', 'GS', 'CAT', 'MCD', 'CVX', 'CRM', 'IBM', 'KO', 'MRK', 'CSCO', 'AXP', 'BA', 'AMGN', 'HON', 'DIS', 'MMM', 'NKE', 'SHW', 'TRV', 'VZ'],
};
export const DEFAULT_GROUP = 'market_leaders';

// "Your tickers" form field: listed first, ahead of the chosen group. With only_my_tickers
// as the group, nothing else. Any US symbol works: the server already fetches the whole
// market's calendar, so these are filtered from it at no extra API cost.
export const MAX_CUSTOM_TICKERS = 10;

// Calendar symbol -> the ticker shown. Finnhub's whole-market calendar lists
// Berkshire only as BRK.A.
export const SYMBOL_ALIASES = { 'BRK.A': 'BRK.B' };

// Max items in the flat "upcoming" and "latest" lists used by the smaller layouts.
export const UPCOMING_LIMIT = 12;
export const LATEST_LIMIT = 6;

// Source schedules are in ET; this is the server's own clock.
export const TIME_ZONE = 'America/New_York';

// "Time zone" form field: times on screen are converted to this zone. h24: 24-hour clock.
export const TIME_ZONES = {
  eastern: { tz: 'America/New_York', label: 'ET' },
  central: { tz: 'America/Chicago', label: 'CT' },
  mountain: { tz: 'America/Denver', label: 'MT' },
  arizona: { tz: 'America/Phoenix', label: 'MST' },
  pacific: { tz: 'America/Los_Angeles', label: 'PT' },
  alaska: { tz: 'America/Anchorage', label: 'AKT' },
  hawaii: { tz: 'Pacific/Honolulu', label: 'HST' },
  london: { tz: 'Europe/London', label: 'UK', h24: true },
};
export const DEFAULT_ZONE = 'eastern';

// Hand-kept tables run out. /healthz lists these warnings (and the uptime check fails on
// them) this many days before the last entry, so they get updated before the screen goes quiet.
export const CONFIG_WARN_DAYS = 60;

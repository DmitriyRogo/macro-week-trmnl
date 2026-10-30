# Macro Week (TRMNL Recipe)

This week's market-moving US events on your [TRMNL](https://trmnl.com) e-ink display, and how they turned out.

![Full layout: Next up and Latest strip above Monday to Friday columns with results](docs/screens/full.png)

<sub>Live data, Thursday Oct 29 2026, rendered with TRMNL's `trmnlp` preview.</sub>

| Half horizontal | Half vertical | Quadrant |
| --- | --- | --- |
| ![Half horizontal layout](docs/screens/half_horizontal.png) | ![Half vertical layout](docs/screens/half_vertical.png) | ![Quadrant layout](docs/screens/quadrant.png) |

## What it shows

- **Macro releases** with ET release time: CPI, PPI, Jobs Report, GDP, PCE, Retail Sales, plus (optionally) JOLTS, Jobless Claims, UMich Sentiment, Housing Starts. Once released: the actual number, an arrow vs the prior reading, and the prior (e.g. `+0.3% ▲ prev +0.2%`).
- **FOMC decision days** (2:00 PM ET), marked **SEP** when new economic projections are released. Once decided: **CUT / HOLD / HIKE** and the new target range.
- **Earnings** for a curated list of the biggest US companies, tagged BMO / AMC, with EPS estimate. Once reported: actual EPS with **BEAT / MISS / INLINE**.
- **Market holidays** and 1:00 PM early closes

The screen shows the current week, Mon-Fri, so earlier days keep their results. Saturday recaps the week that just ended; Sunday previews the next one. Results are compared with the prior reading, not consensus (no free source has forecasts).

All times are US Eastern; nothing is converted to the viewer's time zone. Users install it and it works: no API keys, no watchlist.

## How it works

```
FRED ────┐                          ┌─ TRMNL (user A's plugin) ─ device
         ├─ server/ (Fly.io) ─ /week ┤
Finnhub ─┘   fetch hourly, cache     └─ TRMNL (user B's plugin) ─ device
```

- **`server/`** fetches, once an hour with one shared key each: FRED's release calendar, Finnhub's whole-market earnings calendar (which includes actual EPS), and, for releases already due this week, the FRED series holding each result (plus the fed funds target range after an FOMC decision). It filters everything, adds the FOMC and holiday tables, and builds the week. Every user gets the same response (one variant per release scope), so upstream load doesn't grow with installs.
- **`src/`** is the TRMNL plugin. It polls `GET /week?scope=…` and only renders.

## Layouts

| Layout | Shows |
| --- | --- |
| Full | Top strip: **Next up** (inverted) and **Latest** result. Below: Mon-Fri columns with macro events, then an Earnings section ("+N more" past 4). Today's header is inverted; past days have a dashed header rule. |
| Half horizontal | **Up next** (4) beside **Latest results** (4) |
| Half vertical | Big **Next up** block, then the following 5, then **Latest results** (4) |
| Quadrant | Big **Next up** block plus the following 3 |

1-bit safe: pure black and white, the framework's own fonts at 12 / 16 / 21 px, CSS-drawn arrows (pixel fonts may lack arrow glyphs), ASCII-only text. Headline releases are bold; BEAT and rate moves are filled chips, MISS is outlined, INLINE and holidays are dashed. A released event whose data hasn't reached FRED yet shows "awaiting data".

## Form fields (end users)

| Field | keyname | Notes |
| --- | --- | --- |
| Releases | `release_scope` | **All tracked releases** (default) or **Headline only** (CPI, PPI, Jobs, GDP, PCE, Retail Sales). FOMC always shows. |

## Server

### Run locally

Node 20+, no dependencies.

```sh
cd server
export FRED_API_KEY=...        # https://fredaccount.stlouisfed.org/apikeys (free, 32 chars)
export FINNHUB_API_KEY=...     # https://finnhub.io/dashboard
npm start                      # http://localhost:8080/week
npm test
npm run verify                 # checks the live APIs match what the server assumes (run before deploying)
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `FRED_API_KEY` | required | FRED key |
| `FINNHUB_API_KEY` | required | Finnhub key (sent as a header, never logged) |
| `ACCESS_TOKEN` | unset | If set, `/week` requires `Authorization: Bearer <token>` |
| `PORT` | `8080` | |
| `REFRESH_MINUTES` | `60` | Upstream fetch interval |
| `MAX_STALE_HOURS` | `36` | After this long without a successful fetch, that section hides |

Endpoints: `GET /week?scope=all_tracked_releases|headline_only`, `GET /healthz` (minutes since each source last refreshed).

A failed fetch keeps the last good data. On a cold start the first request waits for the initial fetch.

### Deploy to Fly.io

```sh
cd server
fly launch --no-deploy          # or edit `app` in fly.toml if "macro-week" is taken
fly secrets set FRED_API_KEY=... FINNHUB_API_KEY=...
fly deploy
curl https://<app>.fly.dev/week
```

Then set `polling_url` in `src/settings.yml` to `https://<app>.fly.dev/week?scope={{ release_scope }}`.

`fly.toml` keeps one machine always running, because the cache is in memory.

**Access token:** `ACCESS_TOKEN` + `polling_headers: Authorization=Bearer <token>` stops casual scraping, but anyone who installs a public Recipe may be able to see its polling settings, so treat it as a speed bump, not security. Responses are tiny and cached, so serving strangers costs little.

### Data licensing

The server redistributes Finnhub data to every user with one key. Use a Finnhub plan whose terms allow display to third parties; confirm with Finnhub before publishing. FRED release dates are public schedule data; check FRED's terms before adding series values.

## Plugin development

```sh
gem install trmnl_preview      # needs Ruby 4.0+
trmnlp serve                   # previews src/ against polling_url
trmnlp login                   # once, needs TRMNL Developer Edition
trmnlp push                    # after first push, add the returned `id` to src/settings.yml
```

## Files

```
src/settings.yml          plugin settings, polling URL, form field
src/shared.liquid         CSS + shared templates (mw_ev, mw_row, mw_next, mw_title)
src/full.liquid           full layout
src/half_horizontal.liquid, half_vertical.liquid, quadrant.liquid
server/src/config.js      ← everything that needs periodic updates (below)
server/src/build.js       builds the week JSON (pure, unit-tested)
server/src/results.js     formats results: macro value vs prior, FOMC decision, EPS verdict
server/src/sources.js     FRED calendar + series, Finnhub fetchers
server/src/index.js       HTTP server, hourly refresh, cache
server/test/              node:test suites
server/scripts/verify.mjs checks the live FRED / Finnhub APIs (npm run verify)
docs/                     screenshots, original build spec
server/Dockerfile, fly.toml
```

## Maintenance (all in `server/src/config.js`)

| What | When | How |
| --- | --- | --- |
| **FOMC dates** | Yearly, and after each meeting | From <https://federalreserve.gov/monetarypolicy/fomccalendars.htm>, add each meeting's **second day** to `FOMC` with `sep: true` for asterisked meetings. Next year's dates are tentative until confirmed at the preceding meeting. |
| **Market holidays** | Yearly | From <https://www.nyse.com/markets/hours-calendars>, update `MARKET_CLOSED` and `EARLY_CLOSE`. |
| **Ticker list** | Quarterly | Edit `TICKERS` (priority order; first 4 reporting each day show). `EARNINGS_PER_DAY` sets the cap. |
| **Releases** | As needed | Add a FRED `release_id` to `RELEASES` with the `series` that carries its headline number and a `format` (`mom`, `pct`, `change_k`, `level`). Find IDs with `GET https://api.stlouisfed.org/fred/releases?api_key=…&file_type=json`. Re-verify release times yearly. |

Redeploy after editing (`fly deploy`). The plugin itself doesn't need republishing.

### Release allowlist

| release_id | FRED name | Label | ET | Tier | Result series | Shown as |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | Consumer Price Index | CPI | 8:30 | Headline | CPIAUCSL | % m/m |
| 46 | Producer Price Index | PPI | 8:30 | Headline | PPIFIS | % m/m |
| 50 | Employment Situation | Jobs Report | 8:30 | Headline | PAYEMS | payroll change, K |
| 53 | Gross Domestic Product | GDP | 8:30 | Headline | A191RL1Q225SBEA | % q/q annualized |
| 54 | Personal Income and Outlays | PCE | 8:30 | Headline | PCEPI | % m/m |
| 9 | Advance Monthly Sales for Retail and Food Services | Retail Sales | 8:30 | Headline | RSAFS | % m/m |
| 192 | Job Openings and Labor Turnover Survey | JOLTS | 10:00 | Tracked | JTSJOL | openings, M |
| 180 | Unemployment Insurance Weekly Claims Report | Jobless Claims | 8:30 | Tracked | ICSA | initial claims, K |
| 91 | Surveys of Consumers | UMich Sentiment | 10:00 | Tracked | UMCSENT | index |
| 27 | New Residential Construction | Housing Starts | 8:30 | Tracked | HOUST | M, annual rate |

A result shows once the series' newest observation was published on or after the release date. FRED reports `realtime_start` clamped to the requested window, so the server asks for the window starting the day before the release: older values read as that day, a new one carries its real publication date. Revised rows are dropped.

FRED lists a second New Residential Construction date about a week after each housing starts release that doesn't update starts, so `minGapDays: 12` on release 27 drops it (the server reads FRED's calendar from two weeks before the week to spot these). Finnhub caps each call at 1500 rows, so earnings are fetched one day at a time; its whole-market calendar lists Berkshire as `BRK.A`, mapped to BRK.B by `SYMBOL_ALIASES`. FRED usually picks up a release within hours, so results can lag the headline a little. FOMC results use `DFEDTARU` / `DFEDTARL`, which FRED posts the day after the decision.

## Known limits

- No consensus forecasts: macro results compare with the prior reading, earnings with Finnhub's EPS estimate.
- Finnhub doesn't flag unconfirmed earnings dates, so there's no "?" marker. Unknown report times show **TBD**.
- Release times are hardcoded. Shutdowns can delay releases; FRED dates update, but screens refresh at most hourly.

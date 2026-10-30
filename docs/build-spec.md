# Macro Week: TRMNL Plugin Build Spec

Oct 28, 2026 · @Dmitriy R

## Overview

Macro Week is a TRMNL Recipe that shows the next 5 trading days of market-moving US events: major economic releases, FOMC meetings, and earnings dates for a user-chosen watchlist. Existing TRMNL finance plugins show prices; none show what is coming that might move them.

v1 ships as a pure Recipe (no backend). Each weekday is a column. Each column lists:

- Headline macro releases with their ET release time (CPI, jobs report, GDP, PCE, retail sales, jobless claims, and similar)
- FOMC decision days, flagged when the meeting includes new economic projections (SEP)
- Watchlist earnings, tagged BMO (before market open) or AMC (after market close), with EPS estimate when available

Out of scope for v1: consensus forecasts, prior values, more than 5 tickers, time zone conversion.

## Prerequisites

| Item | Why | Notes |
| --- | --- | --- |
| TRMNL Developer Edition | Required to build private plugins and publish Recipes | Add-on on the TRMNL account |
| FRED API key | Release calendar endpoints require it | Free from the St. Louis Fed; 32-character lowercase alphanumeric |
| Finnhub API key | Earnings calendar per symbol | Free tier; confirm rate limits and display terms before publishing |
| `trmnlp` | Local preview server and push to TRMNL | `gem install trmnl_preview`, then `trmnlp login`, `trmnlp serve`, `trmnlp push` |
| GitHub repo | Source of truth for templates and settings | Create under the user's GitHub account |

End users of the published Recipe enter their own FRED and Finnhub keys through form fields.

## Data sources

Three feeds come from APIs; FOMC dates and release times are hardcoded in the template.

### Macro release dates (FRED)

Endpoint: `GET https://api.stlouisfed.org/fred/releases/dates` ([docs](https://fred.stlouisfed.org/docs/api/fred/releases_dates.html))

- `api_key`: required
- `file_type=json`: default is XML
- `include_release_dates_with_no_data=true`: required, otherwise future dates are excluded
- `realtime_start` / `realtime_end`: YYYY-MM-DD, used as the week window
- `sort_order=asc`
- Response: `release_dates` array, each with `release_id`, `release_name`, `date`

This returns every scheduled release from every source, often hundreds per week. Filter in Liquid to an allowlist of headline `release_id` values. Do not guess the IDs: look them up once with `GET /fred/releases` and pin them in the template, with the release name beside each ID in a comment.

Target allowlist (resolve IDs): CPI, PPI, Employment Situation, JOLTS, GDP, Personal Income and Outlays (PCE), Advance Retail Sales, Unemployment Insurance Weekly Claims, University of Michigan Consumer Sentiment, New Residential Construction.

### Release times (hardcoded)

FRED returns dates only. Keep a Liquid map from `release_id` to an ET time string. BLS releases (CPI, PPI, Employment Situation, JOLTS) and BEA releases (GDP, PCE) publish at 8:30 ET; verify each entry against the agency's own schedule before shipping.

### FOMC meetings (hardcoded)

There is no API. Hardcode from the [Fed calendar](https://federalreserve.gov/monetarypolicy/fomccalendars.htm). The decision is announced on the second day. 2027 dates are tentative until confirmed at each prior meeting, so update the table yearly.

| Meeting | Decision day | SEP |
| --- | --- | --- |
| Dec 8-9, 2026 | 2026-12-09 | Yes |
| Jan 26-27, 2027 | 2027-01-27 | No |
| Mar 16-17, 2027 | 2027-03-17 | Yes |
| Apr 27-28, 2027 | 2027-04-28 | No |
| Jun 8-9, 2027 | 2027-06-09 | Yes |
| Jul 27-28, 2027 | 2027-07-28 | No |
| Sep 14-15, 2027 | 2027-09-15 | Yes |
| Oct 26-27, 2027 | 2027-10-27 | No |
| Dec 7-8, 2027 | 2027-12-08 | Yes |

### Earnings (Finnhub)

Endpoint: `GET https://finnhub.io/api/v1/calendar/earnings` with `symbol`, `from`, `to`, `token`. One call per ticker. Expected fields include `date`, `hour` (bmo / amc / dmh), `epsEstimate`, `symbol`. Verify the response shape against Finnhub's current docs before writing the template, since the docs page could not be checked while writing this spec.

## TRMNL wiring

Use the Polling strategy with dynamic URLs. TRMNL fetches up to 6 URLs at once, and each response lands in an index node: `IDX_0` for the first URL, `IDX_1` for the second, and so on ([custom plugins](https://help.trmnl.com/en/articles/9510536-custom-plugins), [dynamic polling URLs](https://help.trmnl.com/en/articles/12689499-dynamic-polling-urls)). URL slots: `IDX_0` is FRED, `IDX_1` to `IDX_5` are up to 5 tickers.

### Polling URLs

The Polling URL box accepts Liquid. TRMNL renders the Liquid first, then splits on line breaks, so each URL must end on its own line. Check output with the Parse button before saving.

```liquid
https://api.stlouisfed.org/fred/releases/dates?api_key={{ fred_api_key }}&file_type=json&include_release_dates_with_no_data=true&sort_order=asc&realtime_start={{ "now" | date: "%Y-%m-%d" }}&realtime_end={{ "now" | date: "%s" | plus: 604800 | date: "%Y-%m-%d" }}
{% assign tickers = watchlist | split: "," %}{% for t in tickers limit: 5 %}
https://finnhub.io/api/v1/calendar/earnings?symbol={{ t | strip | upcase }}&from={{ "now" | date: "%Y-%m-%d" }}&to={{ "now" | date: "%s" | plus: 604800 | date: "%Y-%m-%d" }}&token={{ finnhub_api_key }}
{% endfor %}
```

The window is a rolling 7 days from today. Render only weekdays, capped at 5 columns.

### Form fields

Define in the Form Fields YAML; reference as `{{ keyname }}` in URLs and markup.

| keyname | Type | Purpose |
| --- | --- | --- |
| `fred_api_key` | string | User's FRED key |
| `finnhub_api_key` | string | User's Finnhub key |
| `watchlist` | string | Comma-separated tickers, max 5 used |
| `release_scope` | select | "Headline only" or "All tracked releases" |

### Layouts

Build all four TRMNL framework layouts so the plugin works in mashups: full, half horizontal, half vertical, quadrant. Use a shared main template rendered by each view to avoid duplicating markup.

- Full: 5 weekday columns, macro events on top, earnings below a divider
- Half and quadrant: collapse to a list of the next N events, nearest first
- 1-bit display: show importance with bold weight and inverted blocks, never color; invert today's column
- FOMC decision days get a distinct marker, plus "SEP" when projections are included
- Empty days show a quiet "No major events" line

### Refresh rate

Set "Fastest Refresh Rate" to Hourly. The data changes about once a day.

## Constraints and gotchas

The 6-URL cap is the main limit: one slot for FRED leaves 5 tickers.

### v2 option: middleman service

If v1 outgrows the cap, add a small service on Fly.io that the Recipe polls as a single URL returning aggregated JSON. It would:

- Allow unlimited tickers
- Add each release's prior value from FRED series observations
- Cache responses so users don't need their own API keys
- Keep payload size small and predictable

Tradeoff: rate limits and data redistribution terms become the author's responsibility. Read FRED's and Finnhub's terms before building it. Do not build v2 as part of this task.

### Gotchas

- Consensus forecasts are not available from any free source; leave them out rather than scraping.
- Government shutdowns and holidays can delay releases. FRED dates come from the agencies and update, but a cached screen can lag.
- Some earnings dates are estimates. Show "?" when a date isn't confirmed, if the API exposes that.
- Label all times ET; do not convert to the viewer's time zone in v1.
- 2027 FOMC dates are tentative; keep them in one clearly marked block in the template.
- Handle missing data per source: a failed or empty FRED or Finnhub response should hide that section, not break the render.
- Never log or render API keys in the markup.

## Build order

Work in this order and stop for review after step 2.

1. Scaffold a `trmnlp` project in a new GitHub repo: settings, form fields YAML, polling URLs, and four view files sharing one main template.
2. Wire the FRED call. Resolve the headline `release_id` values via `GET /fred/releases`, pin them with names, and render a plain list of this week's filtered releases.
3. Add the release time map and the FOMC table.
4. Add Finnhub earnings for up to 5 tickers.
5. Build the full layout, then half horizontal, half vertical, and quadrant.
6. Push with `trmnlp push`, test on the device, publish as Unlisted, then submit as a public Recipe.

### Acceptance criteria

- [ ] Parse button shows 1 FRED URL plus one URL per ticker, capped at 5
- [ ] Only allowlisted releases render, each with an ET time
- [ ] FOMC decision days render with an SEP marker where applicable
- [ ] Earnings show ticker, BMO/AMC, and EPS estimate when present
- [ ] Weekends are skipped; today's column is inverted
- [ ] All four layouts render in `trmnlp serve` without overflow on the 800x480 1-bit OG screen
- [ ] Empty or failed responses degrade gracefully
- [ ] README covers setup, form fields, how to get each API key, and how to update FOMC dates

## Sources

- [TRMNL: Custom plugins](https://help.trmnl.com/en/articles/9510536-custom-plugins)
- [TRMNL: Dynamic polling URLs](https://help.trmnl.com/en/articles/12689499-dynamic-polling-urls)
- [TRMNL: Plugin marketplace introduction](https://docs.trmnl.com/go/plugin-marketplace/introduction)
- [FRED API: fred/releases/dates](https://fred.stlouisfed.org/docs/api/fred/releases_dates.html)
- [FRED API: fred/release/dates](https://fred.stlouisfed.org/docs/api/fred/release_dates.html)
- [Federal Reserve: FOMC meeting calendars](https://federalreserve.gov/monetarypolicy/fomccalendars.htm)

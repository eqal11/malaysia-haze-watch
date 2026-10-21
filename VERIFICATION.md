# Verification report

Local verification date: **21 October 2026, Malaysia time (UTC+8)**.

## Automated checks

| Check | Result |
|---|---|
| `node tests/test.mjs` | 14 passing groups: category boundaries and invalid inputs; IDW known answer/exact points/radius/duplicates; LOOCV; land holes; station schemas; stale/future observations; district measured/estimated/unavailable; wind vectors; FIRMS thresholds/time/state filters; state-name reconciliation; all shipped browser schemas |
| Python unittest | 5 passing tests: legacy DOE timestamp conversion; missing/duplicate readings; last-good preservation after request failure; WGS84/GeoJSON validation; FIRMS CSV normalization, empty data, old data and invalid-key response |
| `python scripts/validate_data.py` | Passed on 68 real stations, 6,170 VIIRS detections, all bundled polygon files and metadata |
| JavaScript syntax | All modules passed `node --check` |
| Local static server | Index, ES-module worker and district GeoJSON returned HTTP 200 with appropriate MIME types |
| ADM2 payload | 401,618 bytes, 159 features, valid WGS84 longitude/latitude rings |

No synthetic fixture is served by the application. Unit-test examples exist only in `tests/`.

## Browser verification

Performed in the in-app Chromium browser using the real locally served site:

- Default map, Malaysia fit, OpenStreetMap tiles, district fill, station markers and NASA detections visibly rendered.
- Activated PM2.5 raster, IPU raster and wind; model/raster status completed successfully. IPU leave-one-out validation displayed **n=68/68, RMSE 16.4, MAE 10.7 IPU** for the included snapshot and default settings. These are snapshot-specific results, not promised accuracy.
- Selangor and Pulau Pinang state selections updated KPIs and table; Penang/Malacca aliases were reconciled with Malay source names. BM/English toggle updated interface labels.
- Search for Klang in district mode returned its real district value. Selecting the accessible table button opened the popup with station IPU, category, pollutant, source type, MYT time and Malay health advice.
- Analytics loaded Chart.js lazily. Station history showed the explicit insufficient-history state; category distribution and hotspot chart rendered. Source cards showed successful timestamps for DOE, NASA and both Open-Meteo feeds.
- Mobile 390×844 layout checked: document width equalled viewport width (390), with no horizontal overflow. Desktop layout also checked.
- Browser console contained **no warnings or errors** in the tested session.
- Screenshots: [desktop](assets/screenshots/desktop.jpg), [map](assets/screenshots/map-desktop.jpg), [mobile](assets/screenshots/mobile.jpg).

## Source verification details

- data.gov.my catalogue response confirmed monthly national concentrations, unsuitable for current district/station IPU.
- Direct DOE ArcGIS query returned the required fields. Service metadata declared WGS84. CORS allowed only `https://eqmp.doe.gov.my`. DOE's public portal bundle inspected during verification was `https://eqms.doe.gov.my/js/app.8df358d9.js`; its legacy date renderer uses UTC date/hour methods to display the feed's Malaysian wall-clock epoch values. The adapter's minus-eight-hour convention is explicit and tested. Reverify when that feed changes.
- Both Open-Meteo APIs returned multi-location JSON and wildcard CORS with a browser Origin header. Returned `current` fields matched the implementation. Browser successfully loaded 34 locations for each feed.
- FIRMS area API rejected an invalid key with its documented-style error. The official keyless 48h CSV was successfully fetched and parsed; confidence values were words (`nominal`, etc.). The authenticated key path remains unverified until a real GitHub Secret is supplied.
- geoBoundaries source metadata and linked GeoJSON downloads succeeded. Simplification ran with mapshaper 0.7.93, topology cleaning and coordinate rounding; provenance is bundled.
- CARTO returned an API-key-required image, so the app uses OSM. OSM tile HTTP 200 and actual browser tile rendering verified. Generic command-line requests without compliant identification can be blocked by OSM; the application uses normal browser tile requests.

## Feature A–G checklist

- [x] **A — Map:** Malaysia extent, OSM, independent toggles and active legends.
- [x] **B — District IPU:** measured versus estimated styling/source labels, Malay advice, times and no-neighbour unavailable handling.
- [x] **C — Sources:** real DOE snapshots, browser Open-Meteo, FIRMS CSV to GeoJSON, source health and scheduled workflows. Preferred FIRMS key path needs a real secret to verify.
- [x] **D — Interpolation:** adjustable IDW, Malaysian land masks, separate IPU and model PM2.5 rasters, worker calculation, IPU LOOCV. Optional Kriging omitted.
- [x] **E — Hotspots/wind:** confidence/FRP classification, region/time filters, animated vectors/static arrows and qualified flow summary.
- [x] **F — Dashboard:** category counts, worst represented district, hotspot/wind KPIs, searchable/sortable top 10, three charts, synchronized state filtering and source freshness indicators. Station history grows from actual snapshots.
- [x] **G — UX:** responsive BM/English interface, text/source cues beyond colour, loading/empty/error states, geolocation/nearest-station implementation and keyboard-accessible table-to-popup selection.

## Verification limits and deployment work

1. No GitHub repository, account connection or deployment target was supplied. GitHub Actions and Pages files are prepared; **the project has not been published** and scheduled runs have not been executed on GitHub.
2. No real FIRMS_MAP_KEY was available. Live fallback ingestion is verified; the authenticated route is supported from official docs and tested parser behavior, but an authenticated download still needs a real key.
3. Actual user geolocation was not requested or read during testing. The browser Geolocation API path, error handling and nearest-station calculation are implemented; live location requires visitor permission and HTTPS (or localhost).
4. No Lighthouse engine was available through the browser tools. **85+ mobile is a target, not a measured result.** Performance depends on device, CDN access and tile/model services. A deployed audit remains necessary.
5. Station trend is intentionally sparse at first. Source observation gaps, stale readings, old boundary vintage, generalized region/country masks, forecast uncertainty, service terms and DOE reuse rights remain material limitations detailed in README.

These checks establish a functioning local static application, not a guarantee of third-party uptime or a completed hosted deployment.

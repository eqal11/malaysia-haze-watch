# Malaysia Haze Watch

A buildless, browser-only Web GIS for Malaysian haze monitoring. It combines official DOE station IPU observations, explicitly labelled district estimates, CAMS PM2.5, surface wind and NASA VIIRS hotspots. No application server, database, paid hosting or frontend secrets.

**Live demo:** deployment pending — after enabling Pages, your URL is `https://<your-github-username>.github.io/<your-repository>/`. This is the only intentional deployment placeholder; no data is simulated.

## Screenshots

Desktop and mobile screenshots from the local static-site verification are in [`assets/screenshots/`](assets/screenshots/). They show real source snapshots; values will change. See [`VERIFICATION.md`](VERIFICATION.md) for test evidence and deployment limits.

![Desktop map with real DOE stations and NASA VIIRS detections](assets/screenshots/map-desktop.jpg)

[Full desktop screenshot](assets/screenshots/desktop.jpg) · [Mobile screenshot](assets/screenshots/mobile.jpg)

## Quick start: GitHub Pages

1. Create a public GitHub repository, or fork this project. Put this directory's contents at the repository root, on the `main` branch.
2. In **Settings → Secrets and variables → Actions**, add `FIRMS_MAP_KEY`, obtained free from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Never put the key in JS, repository files, screenshots or URLs in logs. If no key is set, the fetcher uses NASA's official public 48h CSV and identifies that transport in source status. An invalid configured key causes a visible failure and preserves the last good file; it is not silently ignored.
3. Enable Actions on the fork. Repository settings must allow the data job to write repository contents; its job-scoped token uses `contents: write`. Other jobs have only their required permissions. Branch protection must permit the bot's data commits, or adapt the workflow to a bot PR process.
4. Run **Refresh environmental data** manually. It then runs at minutes 17 and 47 each hour (UTC). GitHub schedules can be delayed; inactive public-repository schedules may be disabled by GitHub. Check the Actions page when freshness alerts appear.
5. In **Settings → Pages**, choose **GitHub Actions** as the source. Run **Deploy static Pages**, or push to `main`.
6. Open the deployment URL shown by the Pages job. There is no frontend install or build step.

`GITHUB_TOKEN` data commits do not trigger ordinary push workflows. The separate Pages workflow therefore also responds to completion of the data workflow and checks out the latest `main`. It deploys retained good snapshots plus failure metadata even when an upstream fetch failed. Deploy artifacts contain only public HTML, CSS, JS, data and assets.

### Local development

Requires Node 20+ for the convenience server/test runner and Python 3.10+ for ingestion. No Python packages or frontend npm dependencies are required.

**Windows:** extract the complete ZIP, open the project directory and double-click `RUN-LOCAL.bat`. Leave its console window open, then visit `http://127.0.0.1:4173` in Chrome or Edge. Do not double-click `index.html`; `file://` blocks the modules/data loading required by this application. Internet access is required for CDN libraries, OSM tiles and model APIs. Closing the server window stops the local site. Local testing does not publish the project to the internet.

```sh
node scripts/serve.mjs
# Open http://127.0.0.1:4173 — ES modules cannot run correctly from file://.
node tests/test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/validate_data.py
python scripts/update.py
```

The last command returns a failure status when a source fails, after updating source health. It keeps previous good files. `serve.mjs` is only a development utility; GitHub Pages hosts the production static files.

## Verified data sources and final endpoints

Verified with live HTTP requests on **21 October 2026**. Read [`data/boundaries/sources.json`](data/boundaries/sources.json) for the actual boundary release URLs and licences.

| Source | Endpoint and format | Auth / CORS | Source cadence / application cadence |
|---|---|---|---|
| data.gov.my | `https://api.data.gov.my/data-catalogue?id=air_pollution&limit=1` — JSON; [catalogue](https://data.gov.my/data-catalogue/air_pollution) | No key; not used by browser | Monthly national concentrations, **not current station IPU**. Rejected as the live IPU source. No suitable current station dataset was found in the catalogue search. |
| DOE MyEQMS | `https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?f=json&outFields=*&returnGeometry=false&where=1%3D1` — ArcGIS JSON | No key; response restricts allowed origin to `https://eqmp.doe.gov.my`, so **Actions only** | Hourly observations; poll every 30 minutes. Public endpoint, not a documented stable API contract. |
| Open-Meteo air quality | `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=…&longitude=…&current=pm2_5&domains=cams_global&timezone=GMT&timeformat=unixtime` — multi-location JSON | No key; verified `Access-Control-Allow-Origin: *` | Global CAMS model, typically two model runs daily with hourly output; browser fetch/cache one hour. Model time is shown, never labelled measured. |
| Open-Meteo forecast | `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=GMT&timeformat=unixtime` — multi-location JSON | No key; verified wildcard CORS | Model-dependent updates; current output uses 15-minute intervals. Browser fetch/cache one hour. |
| FIRMS preferred | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/95,-5,120,8/3` — CSV | `FIRMS_MAP_KEY` secret; Actions only, no browser CORS dependency | Satellite overpasses, not continuous monitoring. Poll every 30 minutes. Three UTC calendar days requested, then filtered to a rolling 48h. |
| FIRMS fallback | `https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_48h.csv` — CSV | No key; Actions only | Successful live download verified; filter global CSV to `95,-5,120,8`, then rolling 48h. Used only when no secret is configured. |
| geoBoundaries | `https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM2/`, plus MYS ADM0/ADM1 and IDN ADM0 — metadata JSON links to WGS84 GeoJSON | No key; bundled locally, no runtime CORS dependency | Static boundary release, not an observation feed. |
| OpenStreetMap | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — raster tiles | No key; standard browser tile requests, with attribution and Referer | Community-maintained basemap; obey the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). No bulk download, offline prefetch or cache bypass. |

The FIRMS area route returned `Invalid MAP_KEY.` for an intentionally invalid probe, confirming the route's auth requirement. **An authenticated area download could not be verified without a real secret.** The official documentation's schema was cross-checked against the real public CSV. The script accepts VIIRS `l/n/h` and `low/nominal/high` confidence representations.

CARTO's formerly keyless `light_all` tiles returned a PNG saying **API KEY REQUIRED** during live checks, so they are not used. The old APIMS hostname did not provide a usable live feed; the current MyEQMS public service was selected. DOE's portal and service metadata were inspected; metadata has an empty `copyrightText` and does not declare a reusable open-data licence. Public accessibility is not a grant of an open licence. This project's MIT licence covers code, not DOE observations. No login, CAPTCHA or access control is bypassed. Confirm DOE reuse conditions for your deployment and recheck them if the service changes.

Official references: [DOE APIMS](https://eqms.doe.gov.my/APIMS/main), [Open-Meteo AQ docs](https://open-meteo.com/en/docs/air-quality-api), [Forecast docs](https://open-meteo.com/en/docs), [FIRMS area docs](https://firms.modaps.eosdis.nasa.gov/api/area/), [FIRMS API tutorial](https://firms2.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html).

## Methodology

### IPU and district representation

IPU uses the Malaysian scale, **not US AQI**: 0–50 Baik, >50–100 Sederhana, >100–200 Tidak Sihat, >200–300 Sangat Tidak Sihat, >300 Berbahaya. Null, non-finite, negative and sentinel `-1` values never become zero. District colours follow the official blue, green, yellow, orange and red sequence. Labels and dashed outlines supplement colour.

Point-in-polygon assigns stations to districts using WGS84 `[longitude, latitude]`. A district containing usable observations uses its **highest station reading**, not a claim of a district-wide measurement or average. Its popup identifies the station. A district without an observation uses IDW at a point inside its polygon. Estimates use a lighter fill and dashed boundary and are labelled **Anggaran / Estimated** in popups and rankings. Source pollutant names are reported as source-station pollutants for estimates; no pollutant is inferred from IPU alone. If no usable neighbour exists within the selected radius, the district is grey/unavailable.

Station observations older than six hours or more than an hour in the future are excluded from estimates and current KPI category counts. Their original values/times remain visible with stale indicators. The legacy `publicmapproxy` feed encodes Malaysian wall time in `DATETIME` epoch milliseconds; DOE's legacy popup displays the UTC hour of that value. The adapter explicitly subtracts eight hours, stores the normalized UTC ISO timestamp, and rejects future normalized timestamps. This is a **feed-specific convention**, not a generic ArcGIS epoch rule; changing sources requires re-verifying it. Hourly update races can produce null `DATETIME`; the last dated record for that station is retained with its original timestamp, never relabelled fresh.

### IDW and masks

`estimate(x) = Σ(value_i / distance_i^p) / Σ(1 / distance_i^p)`, using great-circle kilometres. Default `p=2`, cell size 15 km, radius 200 km. The UI supports powers 1–5, cells 8–50 km and radius 25–500 km. A point coinciding with observations returns their mean, avoiding division by zero. With no neighbours the result is null. Higher resolution does not add information to sparse inputs.

The optional-on-demand **IPU interpolation** uses usable DOE stations. **PM2.5 interpolation** uses 34 fixed land/coastal sampling locations from Open-Meteo's global CAMS model; these are **model samples, not PM2.5 monitoring stations**. The DOE feed supplies IPU rather than raw measured PM2.5 concentrations, so no measured PM2.5 station layer is claimed. PM2.5 is never converted into Malaysian IPU. Returned model coordinates and data times are retained.

Web Workers calculate grids in two regional windows. Browser canvases interpolate grid colours and apply polygon masks, including holes and islands, in Web Mercator coordinates before Leaflet image overlays are displayed. Only Malaysian district land selected by the state filter is included. The mask reflects generalized boundaries, not cadastral accuracy. Grid nodes outside land are not estimated.

Leave-one-out validation is included for the IPU raster: each station is predicted from all the others with the selected power/radius; RMSE, MAE and prediction coverage `n/total` are reported in IPU units. This measures spatial prediction at available stations, not forecast skill, health risk accuracy or model PM2.5 accuracy. Kriging is optional in the brief and is not included.

### Hotspots and wind

Risk is an **application-defined detection priority**, not an official hazard or exposure assessment. Thresholds live in `js/config.js`:

| Label | Rule (checked in this order) |
|---|---|
| Bahaya / High | VIIRS confidence `high` **or** FRP ≥ 50 MW |
| Sederhana / Moderate | confidence `nominal` **or** FRP ≥ 10 MW |
| Rendah / Low | Remaining low-confidence detections with FRP < 10 MW |

High/moderate/low markers use radii 7/4.5/3 pixels and red/orange/ochre colours. FRP is fire radiative power in MW. One detection is not one unique fire; repeated satellite passes are retained, exact location/time/sensor duplicates are removed. A point is not proof of smoke reaching Malaysia.

Countries are assigned against geoBoundaries MYS/IDN land polygons; unassigned points remain **Other**, never guessed to be Indonesia. The Sumatra/Kalimantan regional filter is an explicitly approximate geographic grouping within Indonesian land (Sumatra longitude <106°, Kalimantan longitude ≥108° and latitude <4.3°); nearby islands/border precision are limitations. This bounding box also includes parts of other countries. Regional filters, 6/24/48h windows and state selection apply to map points. The 24h KPI always counts 24h, and the history chart always spans 48h, with both respecting selected state and region. Selecting a state restricts hotspot statistics to that Malaysian state's land; Indonesia then correctly counts zero.

Wind speed/direction are 10m model fields. Convert meteorological **from** direction θ: `u=-speed*sin(θ)`, `v=-speed*cos(θ)`. Arrows and animated particles move downwind; nearby model vectors are sampled for visualization, with animation speed visually scaled. Colour bands: <2, 2–5, ≥5 m/s. The KPI is the arithmetic mean scalar speed and vector-mean from direction. The regional summary is only a simple surface-flow proxy: eastward western flow for Sumatra→Peninsula, northward eastern flow for Kalimantan→Sarawak. It does **not** compute trajectories, smoke transport, source attribution or vertical atmospheric flow. Reduced-motion users get static arrows.

## Data integrity, freshness and performance

- Real snapshots are included, with original observation times. Historical station charts accumulate observed snapshots; fewer than two real observations show an honest insufficient-history state. No backfilled, interpolated or fabricated temporal readings.
- Request timeout 45s in Python; three attempts with exponential backoff. Strict required fields, coordinates, dates and category validation. JSON writes use atomic replacements. Each source updates independently; a failure keeps its last-good file and records failure metadata. Errors avoid logging secret-bearing URLs.
- Browser request timeout 25s, model cache one hour in localStorage, manual refresh respects that model cache. Two batched Open-Meteo requests cover 34 points; API accounting may count multiple locations as multiple calls. No per-frame network requests. Free Open-Meteo service is [non-commercial only](https://open-meteo.com/en/terms), with published request limits. Public high-traffic installations may exceed service limits even with caching.
- Browser reloads static snapshots hourly. Source badges show both last successful fetch and observation/model time in `Asia/Kuala_Lumpur` (UTC+8). Stale thresholds: IPU 3h, FIRMS 4h, PM2.5 6h, wind 3h; configurable. FIRMS snapshot freshness is fetch time, not proof of complete satellite coverage. Old points are removed by rolling-window filters even when an old file is retained.
- Leaflet 1.9.4 and Chart.js 4.4.8 use pinned CDNs. Charts load near the viewport; the wind module and raster workers load only when toggled. Canvas renders thousands of detections; workers protect the main thread. External fonts have system fallbacks. Network failures display unavailable states. An invalid basemap response delivered as a valid image may not generate a browser tile error, which is why live visual QA matters.
- Mobile Lighthouse target: **85+**, not a measured or guaranteed score. A mobile Lighthouse audit was not available in this environment. Run Chrome DevTools Lighthouse against the deployed HTTPS site. See the verification report for actual checks completed.

## Boundaries and reproducibility

The pinned downloaded MYS release represents 2020 boundaries; **159 actual ADM2 features** were present even though the API metadata reports 160. This is not necessarily today's complete district roster. States were assigned by polygon vertex membership; small boundary differences and station positions near borders can affect assignment. No district boundary was invented.

One-time preparation is separate from scheduled refresh:

```sh
python scripts/prepare_boundaries.py
# mapshaper 0.7.93; repeat for each input, preserving shared district topology
npx --yes mapshaper@0.7.93 data/boundaries/districts.geojson -simplify weighted 40% keep-shapes -clean -o format=geojson precision=0.00001 force data/boundaries/districts.geojson
npx --yes mapshaper@0.7.93 data/boundaries/states.geojson -simplify weighted 15% keep-shapes -clean -o format=geojson precision=0.00001 force data/boundaries/states.geojson
npx --yes mapshaper@0.7.93 data/boundaries/malaysia.geojson -simplify weighted 10% keep-shapes -clean -o format=geojson precision=0.00001 force data/boundaries/malaysia.geojson
npx --yes mapshaper@0.7.93 data/boundaries/indonesia.geojson -simplify weighted 3% keep-shapes -clean -o format=geojson precision=0.00001 force data/boundaries/indonesia.geojson
python scripts/build_grid.py
python scripts/update.py
python scripts/validate_data.py
```

ADM2 is about **402 KB**, below the requested 3 MB budget. Boundary downloads use current metadata; exact release URLs from this delivery are recorded in `sources.json`. Rebuilding against a newer upstream release may change geometry. `mapshaper` is only for maintainers updating boundaries; the frontend and scheduled fetches have no build dependency.

## File tree

```text
.
├── .github/workflows/
│   ├── fetch-data.yml
│   └── pages.yml
├── assets/
│   ├── mark.svg
│   └── screenshots/
├── css/style.css
├── js/
│   ├── app.js
│   ├── config.js
│   ├── core.js
│   ├── dashboard.js
│   ├── data.js
│   ├── geometry.js
│   ├── i18n.js
│   ├── idw.js
│   ├── layers.js
│   ├── map.js
│   ├── raster-worker.js
│   └── wind.js
├── data/
│   ├── boundaries/{districts,states,malaysia,indonesia}.geojson
│   ├── boundaries/sources.json
│   ├── ipu.json
│   ├── hotspots.geojson
│   ├── meta.json
│   └── sampling-grid.json
├── scripts/
│   ├── prepare_boundaries.py
│   ├── build_grid.py
│   ├── fetch_ipu.py
│   ├── fetch_firms.py
│   ├── update.py
│   ├── utils.py
│   ├── validate_data.py
│   └── serve.mjs
├── tests/{test.mjs,test_ingestion.py}
├── index.html
├── RUN-LOCAL.bat
├── package.json
├── .gitignore
├── .nojekyll
├── README.md
├── VERIFICATION.md
└── LICENSE
```

## Attribution and disclaimer

Code: MIT. **DOE Malaysia / Jabatan Alam Sekitar**: official station IPU, all data rights retained by its provider; see reuse limitation above. **NASA LANCE / FIRMS**, VIIRS S-NPP NRT: [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms); [citation guidance](https://www.earthdata.nasa.gov/data/tools/firms/citation). **Open-Meteo** weather API and **CAMS / Copernicus Atmosphere Monitoring Service** air quality forecasts: [AQ attribution and model references](https://open-meteo.com/en/docs/air-quality-api), CC BY 4.0 data, with free API use subject to non-commercial service terms. **OpenStreetMap contributors**, [ODbL attribution](https://www.openstreetmap.org/copyright), and OSM Foundation tile service. **geoBoundaries / William & Mary geoLab**, source providers and licences as listed individually in `data/boundaries/sources.json` (MYS ADM2: geoBoundaries, citypopulation.de, CC BY 3.0). Leaflet BSD-2-Clause; Chart.js MIT. Fonts DM Sans and Manrope under SIL Open Font License via Google Fonts.

Near real-time does not mean instantaneous. FIRMS detections depend on overpasses, cloud and processing; NRT products can lag by hours. Estimates are not measurements, model output is not local observed PM2.5, and absent detections do not prove absence of fire. Health text is general Malay guidance by category. **This is not an official health advisory**. Refer to [DOE Malaysia](https://eqms.doe.gov.my/APIMS/main), [MetMalaysia](https://www.met.gov.my/) and Malaysian health authorities for official decisions.

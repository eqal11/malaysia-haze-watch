# Fire, polygons and visual methodology upgrade

Cumulative changes compared with V2.2. The upgrade preserves current IPU, raw and attributed hotspots, source health, archives, context inputs and credentials.

- `.github/workflows/fetch-data.yml`
- `.github/workflows/pages.yml`
- `FIRE-ANALYSIS.md`
- `FIRE-VERIFICATION.md`
- `POLYGONS.md`
- `README.md`
- `RUN-LOCAL.bat`
- `START-HERE.md`
- `assets/screenshots/fire-dashboard.png`
- `assets/screenshots/fire-map.png`
- `assets/screenshots/fire-mobile.png`
- `assets/screenshots/fire-points-polygons.png`
- `assets/screenshots/fire-polygon-popup.png`
- `css/methodology.css`
- `css/style.css`
- `data/fire-config.json`
- `data/fire_events.geojson`
- `data/forest_fires.geojson`
- `index.html`
- `js/app.js`
- `js/config.js`
- `js/dashboard.js`
- `js/fire-core.js`
- `js/fire-explorer.js`
- `js/footprint-worker.js`
- `js/footprints.js`
- `js/i18n.js`
- `js/methodology.js`
- `js/satellite.js`
- `methodology.html`
- `package.json`
- `scripts/classify_fires.py`
- `scripts/refresh_live.py`
- `scripts/serve.mjs`
- `scripts/validate_data.py`
- `tests/fires.mjs`
- `tests/footprints.mjs`
- `tests/test_fires.py`
- `tests/test_live.py`
- `tests/vendor/LICENSE.md`
- `tests/vendor/polygon-clipping-0.15.7.cjs`

Visual guide: methodology.html, css/methodology.css, js/methodology.js and new translations in js/i18n.js. Both Pages workflows now include all root HTML pages. README remains accessible.

Verification: all 50 JavaScript test groups pass. BM/EN switching, desktop layout, mobile layout without horizontal overflow, map navigation and empty browser error log checked. Public GitHub deployment has not been performed.

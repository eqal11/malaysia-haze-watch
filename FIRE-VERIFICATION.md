# Version 2.3 verification, 22 October 2026

## Checks completed

- **43 JavaScript test groups passed:** 14 original, 9 history, 8 land context, 5 live collector, 7 new fire analysis. No regression failures.
- **24 Python tests passed:** previous 18 plus 6 fire tests covering known DBSCAN clusters/noise, time gate, peat priority, null context, low-FRP peat retention, distinct-day persistence, repeated nominal cells and last-good failure handling.
- Python schema validation passed: 68 real stations, 10,942 real current hotspot detections, attributed products, archives and new fire products. All geometries are WGS84 with `[longitude,latitude]`. Data files remain below 5,000,000 bytes.
- Real local collector completed IPU, FIRMS, archive retention, GeoPandas attribution, **fire analysis** and validation with status `ok`, in the new preview only. This was a live-source run, not synthetic fixture data.
- Current classification contains 10,942 detections. The available rolling seven-day archive contains 12,062 deduplicated detections, grouped into 800 DBSCAN groups plus retained noise. The initial 48h filtered view showed 760 groups and 10,942 points. Counts are observations, not separate fires.
- Live GIBS capabilities and actual JPEG tile returned HTTP 200 with wildcard CORS. Layer, format, tile dimensions, zoom range, CRS and matrix identifier were read from capabilities.
- Browser loaded real 21 October true-colour tiles over Central Kalimantan with event circles, individual points and attribution. Opacity was changed to 100%. For the same viewport on 22 October, blank tiles correctly produced the no-imagery-yet message. This result is time/viewport dependent, not a claim that the whole UTC day has no imagery.
- Country, province and peat filters worked. Malaysia showed 26 detections; selecting the main Sarawak state filter reduced this to 15. A peat-only Central Kalimantan view showed 3,569 detections and 121 groups within the tested 48h window.
- A real event popup displayed 445 detections, FRP sum 2,832.79 MW and two observed MYT days, with pixel-footprint and interpretation warnings. No burned area confirmation was claimed.
- Seven-day playback started with an honest missing-archive frame and finished on the latest day. The 30-day chart left missing dates as gaps rather than invented zeros. Country/state changes, table focus and BM/EN labels worked.
- An isolated QA HTTP server returned a controlled 404 for the fire-events file. The analysis displayed a retry/error state while the original 68-station dashboard remained usable. This QA response was not written to the shipped data.
- Mobile viewport requested at 390 px reported 375 px layout/client width and 375 px scroll width, with no horizontal page overflow. Desktop controls are independently scrollable and keyboard-focusable. Screenshots were visually inspected.
- No console errors were observed in the normal live preview. The intentional missing-file QA test naturally generated a network error for its controlled 404.

## Limits and skipped optional work

- No protected-area source or `in_protected` attribution was added.
- Sentinel-2 dNBR is not implemented. `burn_confirmed` is null; true-colour browsing is not proof of a burn scar or fire cause.
- Seven-/30-day UI ranges are supported, but complete data are not available for all dates. No historical observations were fabricated. Group membership is retrospective within the current seven-day product; see method documentation.
- The full workflow has been exercised locally through the same Python entry point. The new version has **not** been uploaded, tested on a fresh GitHub-hosted runner, or deployed to the public site during this task. Existing public automation and cron-job.org credentials were not changed.
- Lighthouse was not run; no new Lighthouse score is claimed. Large new analysis and imagery are lazy-loaded, existing pinned CDN versions retained, and no frontend build step was added.

## Review artifacts

- `assets/screenshots/fire-map.png`: real GIBS imagery and event popup.
- `assets/screenshots/fire-dashboard.png`: filters, counts and charts.
- `assets/screenshots/fire-mobile.png`: responsive analysis controls.
- `FIRE-ANALYSIS.md`: sources, licences, methodology, compact file schema, limitations and safe upgrade instructions.
- `CHANGED-FILES.md`: exact code/config changes included in the upgrade package.

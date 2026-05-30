# Refactor Verification Matrix

Use this matrix for small TokyoRailMap refactor slices. Keep the checks close to the files touched by the slice, then run the shared test entry before marking the Linear issue done.

## Always

- `node --check <touched-js-files>`
- `npm test`
- `git diff --check`

## App/Selection

- `node --check src/app.js`
- `node --check src/features/selection/selectionEffectsController.js`
- `node tests/selectionEffectsController.smoke.mjs`
- Manually verify line, station, company, clear selection, and multi-select base highlight.

## Layer/Map Runtime

- `node --check src/features/layer/layerFeature.js`
- `node --check src/services/mapEngine.js`
- `node tests/panelSearchBoundary.smoke.mjs`
- Manually verify station offset mode, transfer capsules, collision refresh, zoom, and pan.

## Panel/Search

- `node --check src/features/panel/panel.js`
- `node --check src/features/search/search.js`
- `node --check src/features/search/travel-search-ui.js`
- `node tests/panelSearchBoundary.smoke.mjs`
- Manually verify panel line/station clicks, search result selection, journey search, and map-pick mode.

## Print Legacy

- `node --check src/features/print/print.js`
- `node --check src/app.js`
- Manually verify base map export, trip-preview export, base highlight export, clear selection export, and multi-select export.

## Domain/Store

- `node --check src/domain/**/*.js`
- `node --check src/store/**/*.js`
- `node tests/routePlanningDomain.smoke.mjs`
- `node tests/routePreviewSelection.smoke.mjs`
- Prefer pure smoke tests with no DOM, no MapLibre, and no network.

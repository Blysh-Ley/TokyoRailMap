import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [searchSource, heatmapControlSource, panelViewSource, panelSource, mapInteractionSource, appSource] = await Promise.all([
    read('src/features/search/search.js'),
    read('src/ui/searchHeatmapControl.js'),
    read('src/ui/panelMainView.js'),
    read('src/features/panel/panel.js'),
    read('src/features/map-interactions/mapInteractionController.js'),
    read('src/app.js')
]);

const formSource = await read('src/ui/searchHeatmapFormView.js');
const formCssSource = await read('src/styles/searchHeatmapForm.css');
assert.match(heatmapControlSource, /createSearchHeatmapFormView/);
assert.match(heatmapControlSource, /const openForStation = \(\{ stationId, stationName \}/);
assert.match(heatmapControlSource, /type: 'selectStation'/);
assert.doesNotMatch(heatmapControlSource, /drawReachableStopsHeatmap|setReachableStopsHeatmapMinutes/);
assert.match(searchSource, /openHeatmapForStation\s*=\s*async\s*\(\{\s*stationId,\s*stationName\s*\}/);
assert.match(searchSource, /navController\?\.setActive\?\.\('search',\s*\{\s*emit:\s*false,\s*focus:\s*false\s*\}\)/);
assert.match(searchSource, /ui\.showResults\(false\);\s*heatmapControl\.openForStation/);
assert.doesNotMatch(searchSource, /heatmapControl\.drawForStation|heatmapControl\.openPicker/);
assert.match(searchSource, /isHeatmapActive:\s*\(\)\s*=>\s*heatmapControl\.isActive\(\)/);
assert.match(searchSource, /isHeatmapSessionOpen:\s*\(\)\s*=>\s*heatmapControl\.isSessionOpen\(\)/);
assert.match(formSource, /timeInput\.readOnly = true/);
assert.match(formSource, /timeInput\.inputMode = 'none'/);
assert.match(formSource, /onConfirm: \(minutes\) => send\('minutes', minutes\)/);
assert.match(formSource, /form\.addEventListener\('submit'[\s\S]*send\('submit'\)/);
assert.match(formSource, /classList\.toggle\('is-loading', loading\)/);
assert.match(formSource, /form\.addEventListener\('keydown'[\s\S]*aria-expanded[\s\S]*event\.preventDefault\(\);[\s\S]*\}, true\)/);
assert.match(heatmapControlSource, /MOBILE_BOTTOM_NAV_EVENT, onMobileNav/);
assert.match(heatmapControlSource, /isActive: \(\) => interaction\.getState\(\)\.visible && !isOutsideMobileSearch\(\)/);
assert.match(heatmapControlSource, /event\?\.detail\?\.item === 'search'[\s\S]*if \(interaction\.getState\(\)\.resumeOnSearch\) open\(\)/);
assert.match(formSource, /stationInput\.placeholder = '选择站点';/);
assert.match(formSource, /timeInput\.placeholder = '请选择出行时长';/);
assert.doesNotMatch(formSource, /search-heatmap-hint|stationHint|timeHint/);
assert.match(
    formCssSource,
    /\.search-heatmap-form input::placeholder\s*\{[^}]*font-size:\s*11px;[^}]*text-align:\s*left;/,
    'heatmap field hints must be native left-aligned small placeholders'
);
assert.doesNotMatch(formCssSource, /search-heatmap-hint|has-hint|padding-right:\s*(60|110)px/);
assert.match(
    formCssSource,
    /html\[data-theme='dark'\] \.search-heatmap-submit\.is-ready:not\(:disabled\)\s*\{\s*border-color:\s*rgb\(209, 108, 39\);\s*box-shadow:[^;]*rgba\(209, 108, 39,[^;]*;/,
    'dark heatmap ready borders and glow must use the same orange accent'
);
assert.doesNotMatch(formSource, /增加途径点|切换起点和终点|清空起点站|journey-field-clear/);
assert.match(panelViewSource, /onSelectHeatmap:\s*handleTravelHeatmap/);
assert.match(panelViewSource, /heatmap:\s*'出行热图'/);
assert.match(panelViewSource, /onTravelHeatmapStation\?\.\(context\)/);
assert.match(await read('src/features/panel/panelInteractionCore.js'), /action:\s*\{\s*type:\s*'travelHeatmap'\s*\}/);
const panelInteractionSource = await read('src/features/panel/panelInteractionCore.js');
assert.match(panelInteractionSource, /text:\s*labels\.heatmap\s*\|\|\s*'出行热图'/);
assert.match(panelInteractionSource, /text:\s*labels\.destination[\s\S]*text:\s*labels\.heatmap/);
assert.match(panelSource, /onTravelHeatmapStation\s*=\s*typeof options\.onTravelHeatmapStation/);
assert.match(appSource, /onTravelHeatmapStation:\s*\(\{ stationId, stationName \} = \{\}\) => \{\s*clearSelectionsAndRestore\(\);\s*panel\?\.hide\?\.\(\);/);
assert.match(appSource, /onHeatmapStationClick: handleHeatmapStationClick/);
assert.match(appSource, /isHeatmapSessionOpen\?\.\(\) === true\) return/);
assert.match(mapInteractionSource, /if\s*\(isHeatmapActive\?\.\(\)\s*===\s*true\)/);
assert.match(mapInteractionSource, /onHeatmapStationClick\?\.\(\{[\s\S]*stationId/);

const opportunityPlannerSource = await read('src/features/search/travel-search-planner-opportunity.js');
assert.match(
    opportunityPlannerSource,
    /return scan\(\{[^}]*optimizeTransferChecks:\s*Number\(minutes\)\s*>=\s*60[\s,]/,
    'the heatmap entry must retain the unoptimized V2 path for 15/30/45-minute presets'
);
assert.match(
    opportunityPlannerSource,
    /return scan\(\{[^}]*groupEquivalentStates:\s*true[\s,]/,
    'the heatmap entry must explicitly enable equivalent-state grouping for optimized scans'
);
assert.match(opportunityPlannerSource, /const useParallelScan = Number\(minutes\) >= 60;/);
assert.match(opportunityPlannerSource, /const queryIndex = useParallelScan\s*\? buildReachableStopsQueryIndex\(\{ index, originStationId, minutes, sourceStops \}\)\s*: index;/);
assert.match(opportunityPlannerSource, /const scan = useParallelScan \? scanReachableStopsInParallel : scanReachableStopsByDepartureOpportunity;/);
assert.match(opportunityPlannerSource, /return scan\(\{\s*index: queryIndex,/);

console.log('heatmap station flow smoke ok');

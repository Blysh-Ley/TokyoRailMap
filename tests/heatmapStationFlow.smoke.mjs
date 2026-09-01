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
assert.match(
    heatmapControlSource,
    /focusStationOnOpen = true[\s\S]*if \(focusStationOnOpen\) view\.focusStationInput\(\)/,
    'the reusable heatmap control must retain its original auto-focus behavior by default'
);
assert.match(
    searchSource,
    /createSearchHeatmapControl\(\{[\s\S]*focusStationOnOpen:\s*false,[\s\S]*historyView:/,
    'the current search heatmap entry must suppress auto-focus and automatic history disclosure'
);
assert.match(
    formSource,
    /stationInput\.addEventListener\('focus', \(\) => send\('suggest'\)\)/,
    'manual station-field focus must keep the existing history behavior available'
);
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
    searchSource,
    /const createHeatmapHistoryItemView = \(item, \{ interactive = false \} = \{\}\) =>/,
    'the shared heatmap station row renderer must keep history behavior as its default'
);
assert.match(
    searchSource,
    /createSuggestionItem:\s*\(item\) => createHeatmapHistoryItemView\(item, \{ interactive: true \}\)/,
    'heatmap suggestions must reuse the detailed station row renderer as a button'
);
assert.match(
    formSource,
    /const detailedSuggestionMode = !historyMode\s*&& typeof historyView\.createSuggestionItem === 'function'/,
    'detailed heatmap suggestions must stay consistent across desktop and mobile'
);
assert.match(
    formSource,
    /detailedSuggestionMode\s*\? historyView\.createSuggestionItem\(item\)\s*:\s*make\('button', 'search-heatmap-result', item\.text\)/,
    'live suggestions must render the shared detailed row'
);
assert.match(
    formCssSource,
    /\.search-heatmap-result-option\s*\{[^}]*width:\s*100%;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font:\s*inherit;[^}]*text-align:\s*left;/,
    'the detailed suggestion button must preserve the shared route-result geometry'
);
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
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open[^{}]*\{[^}]*--mobile-search-panel-height:\s*var\(--search-expanded-panel-height\);[^}]*height:\s*var\(--mobile-search-panel-height\);[^}]*grid-template-rows:\s*var\(--mobile-search-panel-height\);[^}]*--mobile-journey-sheet-bottom:\s*calc\(/,
    'mobile heatmap results must clear the full 90px control'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open::before[^{}]*\{[^}]*display:\s*block\s*!important;[^}]*width:\s*calc\(100% - 52px\);[^}]*border-radius:\s*26px;/,
    'mobile heatmap must reuse the animated 26px search shell'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open > \.search-heatmap-form[^{}]*\{[^}]*height:\s*var\(--mobile-search-panel-height\);[^}]*grid-template-rows:\s*var\(--mobile-search-panel-height\);/,
    'mobile heatmap form must fill the 90px shell'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open \.search-heatmap-card[^{}]*\{[^}]*position:\s*relative;[^}]*height:\s*var\(--mobile-search-panel-height\);[^}]*grid-template-rows:\s*repeat\(2, var\(--mobile-search-row-height\)\);[^}]*overflow:\s*visible;[^}]*border-radius:\s*26px;/,
    'mobile heatmap card must expose its detached button and use two 45px rows'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open \.search-heatmap-collapse[^{}]*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*right:\s*-52px;[^}]*width:\s*44px;[^}]*height:\s*var\(--mobile-search-collapse-height\);[^}]*border-radius:\s*50%;/,
    'mobile heatmap collapse must be a fixed circular action button'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open \.search-heatmap-collapse::before[^{}]*\{[^}]*mask:\s*url\('\.\.\/\.\.\/assets\/icons\/x\.svg'\)/,
    'mobile heatmap collapse must render the existing x.svg icon'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open \.search-heatmap-submit[^{}]*\{[^}]*align-self:\s*end;[^}]*height:\s*var\(--mobile-search-submit-height\);[^}]*border-radius:\s*50%;/,
    'mobile heatmap search must be a fixed circular action button'
);
assert.match(
    formCssSource,
    /\.search-ui\.is-heatmap-open\s*\{[^}]*height:\s*var\(--search-expanded-panel-height\);[^}]*grid-template-rows:\s*var\(--search-expanded-panel-height\);/,
    'desktop and mobile heatmap shells must share the 90px expanded height'
);
assert.match(
    formCssSource,
    /\.search-heatmap-card\s*\{[^}]*grid-template-rows:\s*repeat\(2, var\(--search-row-height\)\);[^}]*height:\s*var\(--search-expanded-panel-height\);[^}]*border-radius:\s*var\(--search-panel-radius\);[^}]*overflow:\s*visible;/,
    'desktop and mobile heatmap cards must share two 45px rows and the navigation radius'
);
assert.match(
    formCssSource,
    /\.search-heatmap-row\s*\{[^}]*gap:\s*8px;[^}]*padding:\s*0 14px;/,
    'desktop and mobile heatmap rows must share the mobile horizontal spacing'
);
assert.match(
    formCssSource,
    /\.search-heatmap-row \+ \.search-heatmap-row::before\s*\{[^}]*right:\s*14px;[^}]*left:\s*14px;[^}]*border-top:\s*1px solid var\(--ui-border\);/,
    'desktop and mobile heatmap dividers must keep matching side insets'
);
assert.match(
    formCssSource,
    /\.search-heatmap-collapse\s*\{[^}]*right:\s*-52px;[^}]*width:\s*var\(--search-action-size\);[^}]*height:\s*var\(--search-action-size\);[^}]*border-radius:\s*50%;/,
    'desktop and mobile heatmap collapse buttons must share fixed circular geometry'
);
assert.match(
    formCssSource,
    /\.search-heatmap-collapse::before\s*\{[^}]*mask:\s*url\('\.\.\/\.\.\/assets\/icons\/x\.svg'\)/,
    'desktop and mobile heatmap collapse buttons must share x.svg'
);
assert.match(
    formCssSource,
    /\.search-heatmap-submit\s*\{[^}]*align-self:\s*end;[^}]*width:\s*var\(--search-action-size\);[^}]*height:\s*var\(--search-action-size\);[^}]*border-radius:\s*50%;/,
    'desktop and mobile heatmap search buttons must share fixed circular geometry'
);
assert.match(
    formCssSource,
    /\.search-heatmap-results\s*\{[^}]*top:\s*calc\(var\(--search-expanded-panel-height\) \+ 8px\);[^}]*border-radius:\s*var\(--search-panel-radius\);/,
    'desktop heatmap candidates must keep the mobile shell spacing and radius'
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

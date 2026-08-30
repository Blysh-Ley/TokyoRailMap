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

assert.match(heatmapControlSource, /openPicker:\s*picker\.open/);
assert.match(heatmapControlSource, /openForStation:\s*\(stationId\)/);
assert.match(heatmapControlSource, /pendingStationId\s*=\s*''/);
assert.match(heatmapControlSource, /minutes\s*=\s*nextMinutes;\s*render\(\);[\s\S]*setReachableStopsHeatmapMinutes/);
assert.match(searchSource, /openHeatmapForStation\s*=\s*async\s*\(\{\s*stationId,\s*stationName,\s*openPicker\s*=\s*true/);
assert.match(searchSource, /navController\?\.setActive\?\.\('search',\s*\{\s*emit:\s*false,\s*focus:\s*false\s*\}\)/);
assert.match(searchSource, /heatmapControl\.openPicker\?\.\(\)/);
assert.match(searchSource, /ui\.showResults\(false\);[\s\S]*normalizeText\(stationId\)[\s\S]*heatmapControl\.openForStation/);
assert.match(searchSource, /openPicker\s*===\s*false[\s\S]*heatmapControl\.isActive\?\.\(\)[\s\S]*heatmapControl\.drawForStation/);
assert.match(searchSource, /isHeatmapActive:\s*\(\)\s*=>\s*heatmapControl\.isActive\(\)/);
assert.match(panelViewSource, /onSelectHeatmap:\s*handleTravelHeatmap/);
assert.match(panelViewSource, /heatmap:\s*'出行热图'/);
assert.match(panelViewSource, /onTravelHeatmapStation\?\.\(context\)/);
assert.match(await read('src/features/panel/panelInteractionCore.js'), /action:\s*\{\s*type:\s*'travelHeatmap'\s*\}/);
const panelInteractionSource = await read('src/features/panel/panelInteractionCore.js');
assert.match(panelInteractionSource, /text:\s*labels\.heatmap\s*\|\|\s*'出行热图'/);
assert.match(panelInteractionSource, /text:\s*labels\.destination[\s\S]*text:\s*labels\.heatmap/);
assert.match(panelSource, /onTravelHeatmapStation\s*=\s*typeof options\.onTravelHeatmapStation/);
assert.match(appSource, /onTravelHeatmapStation:\s*\(\{ stationId, stationName \} = \{\}\) => \{\s*clearSelectionsAndRestore\(\);\s*panel\?\.hide\?\.\(\);/);
assert.match(appSource, /onHeatmapStationClick:[\s\S]*clearSelectionsAndRestore\(\);[\s\S]*window\.TokyoRailSearchUI[\s\S]*openPicker:\s*false/);
assert.match(mapInteractionSource, /if\s*\(isHeatmapActive\?\.\(\)\s*===\s*true\)/);
assert.match(mapInteractionSource, /onHeatmapStationClick\?\.\(\{[\s\S]*stationId/);

console.log('heatmap station flow smoke ok');

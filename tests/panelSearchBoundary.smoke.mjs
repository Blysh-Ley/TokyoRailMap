import { assertNoPattern } from './helpers/architectureBoundaryScanner.mjs';

const searchUiFiles = [
    'src/features/search/search.js',
    'src/features/search/travel-search-ui.js',
    'src/features/search/journeyPlanRenderer.js'
];

const panelFiles = [
    'src/features/panel/panel.js',
    'src/features/panel/timetable-table.js'
];

assertNoPattern({
    files: searchUiFiles,
    pattern: /\bnew\s+maplibregl\b|\bmaplibregl\.(?!popup\b)|\.(setPaintProperty|setFilter|addLayer|addSource|removeLayer|removeSource|queryRenderedFeatures)\s*\(/,
    message: 'search UI files must not call raw MapLibre APIs'
});

assertNoPattern({
    files: panelFiles,
    pattern: /from\s+['"].*(routePlanning|services\/mapEngine|createMapEngine|mapEngine)['"]|require\([^)]*(routePlanning|services\/mapEngine|createMapEngine|mapEngine)/,
    message: 'panel files must not import route planning or mapEngine dependencies directly'
});

console.log('panel/search boundary smoke ok');

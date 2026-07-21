import { assertNoPattern } from './helpers/architectureBoundaryScanner.mjs';

const shellContentFiles = [
    'src/features/panel/panelCatalogShell.js',
    'src/ui/panelShellView.js'
];

const rawMapLibrePattern = /\bnew\s+maplibregl\b|\bmaplibregl\.(?!popup\b)|\.(setPaintProperty|setFilter|addLayer|addSource|removeLayer|removeSource|queryRenderedFeatures)\s*\(/;
const planningOrMapEngineImportPattern = /from\s+['"].*(routePlanning|travel-search-planner|journeyComputeOrchestrator|services\/mapEngine|createMapEngine|mapEngine)['"]|require\([^)]*(routePlanning|travel-search-planner|journeyComputeOrchestrator|services\/mapEngine|createMapEngine|mapEngine)/;
const panelBusinessImportPattern = /from\s+['"].*(\.\.\/\.\.\/(?:domain|lib|map|services|store)\/|\.\.\/(?:search|route-map|hover|highlight|layer|print)\/)['"]|require\([^)]*(\.\.\/\.\.\/(?:domain|lib|map|services|store)\/|\.\.\/(?:search|route-map|hover|highlight|layer|print)\/)/;
const crossFeatureBridgePattern = /\bwindow\.(?:TokyoRail|__TokyoRail)|\bCustomEvent\b|\bwindow\.dispatchEvent\b|\bwindow\.addEventListener\b/;

assertNoPattern({
    files: shellContentFiles,
    pattern: rawMapLibrePattern,
    message: 'panel shell/content hosts must not call raw MapLibre APIs'
});

assertNoPattern({
    files: shellContentFiles,
    pattern: planningOrMapEngineImportPattern,
    message: 'panel shell/content hosts must not import route planning or mapEngine dependencies'
});

assertNoPattern({
    files: shellContentFiles,
    pattern: panelBusinessImportPattern,
    message: 'panel shell/content hosts must not import feature, domain, service, store, map, or lib business modules'
});

assertNoPattern({
    files: shellContentFiles,
    pattern: crossFeatureBridgePattern,
    message: 'panel shell/content hosts must not own TokyoRail window or global event bridges'
});

console.log('panel shell/content boundary smoke ok');

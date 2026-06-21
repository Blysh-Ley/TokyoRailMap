import {
    assertMaxLines,
    assertPatternBudget
} from './helpers/architectureBoundaryScanner.mjs';

const rawMapLibrePattern = /\bnew\s+maplibregl\b|\bmaplibregl\.(?!popup\b)|\.(setPaintProperty|setFilter|addLayer|addSource|removeLayer|removeSource|queryRenderedFeatures)\s*\(/;
const planningImportPattern = /from\s+['"].*(routePlanning|travel-search-planner|journeyComputeOrchestrator|services\/mapEngine|createMapEngine|mapEngine)['"]|require\([^)]*(routePlanning|travel-search-planner|journeyComputeOrchestrator|services\/mapEngine|createMapEngine|mapEngine)/;
const windowBridgePattern = /\bwindow\.(?:TokyoRail|__TokyoRail)/;
const browserStoragePattern = /\blocalStorage\b|\bwindow\.localStorage\b/;
const globalEventPattern = /\bCustomEvent\b|\bwindow\.dispatchEvent\b|\bwindow\.addEventListener\b/;
const uiDomResponsibilityPattern = /\bdocument\.|\bwindow\.|addEventListener\s*\(|querySelector\s*\(|createElement(?:NS)?\s*\(|innerHTML\b|classList\b|dataset\b|appendChild\s*\(/;

// These budgets intentionally document current legacy debt instead of allowing
// unrestricted growth. Future refactor slices should lower the matching numbers.
const uiDebtBudgets = [
    {
        file: 'src/features/panel/panel.js',
        maxLines: 4890,
        windowBridge: 0,
        browserStorage: 0,
        globalEvents: 3,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 58
    },
    {
        file: 'src/features/panel/panelCatalogShell.js',
        maxLines: 838,
        windowBridge: 0,
        browserStorage: 0,
        globalEvents: 0,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 19
    },
    {
        file: 'src/features/panel/panelInteractionCore.js',
        maxLines: 1145,
        windowBridge: 0,
        browserStorage: 0,
        globalEvents: 0,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 27
    },
    {
        file: 'src/features/search/search.js',
        maxLines: 1623,
        windowBridge: 7,
        browserStorage: 2,
        globalEvents: 0,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 93
    },
    {
        file: 'src/features/search/travel-search-ui.js',
        maxLines: 3013,
        windowBridge: 0,
        browserStorage: 2,
        globalEvents: 1,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 229
    },
    {
        file: 'src/features/route-map/route-map-ui.js',
        maxLines: 2404,
        windowBridge: 2,
        browserStorage: 0,
        globalEvents: 10,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 157
    },
    {
        file: 'src/features/menu/menu.js',
        maxLines: 1195,
        windowBridge: 0,
        browserStorage: 0,
        globalEvents: 0,
        planningImports: 0,
        rawMapLibre: 0,
        domResponsibility: 66
    }
];

for (const budget of uiDebtBudgets) {
    assertMaxLines({
        file: budget.file,
        max: budget.maxLines,
        message: `${budget.file} must not grow while UI/business split is unfinished`
    });

    assertPatternBudget({
        file: budget.file,
        pattern: rawMapLibrePattern,
        max: budget.rawMapLibre,
        message: `${budget.file} raw MapLibre budget`
    });

    assertPatternBudget({
        file: budget.file,
        pattern: planningImportPattern,
        max: budget.planningImports,
        message: `${budget.file} planning/mapEngine import budget`
    });

    assertPatternBudget({
        file: budget.file,
        pattern: windowBridgePattern,
        max: budget.windowBridge,
        message: `${budget.file} TokyoRail window bridge budget`
    });

    assertPatternBudget({
        file: budget.file,
        pattern: browserStoragePattern,
        max: budget.browserStorage,
        message: `${budget.file} browser storage budget`
    });

    assertPatternBudget({
        file: budget.file,
        pattern: globalEventPattern,
        max: budget.globalEvents,
        message: `${budget.file} global event bridge budget`
    });

    assertPatternBudget({
        file: budget.file,
        pattern: uiDomResponsibilityPattern,
        max: budget.domResponsibility,
        message: `${budget.file} DOM responsibility budget`
    });
}

console.log('ui architecture budgets smoke ok');

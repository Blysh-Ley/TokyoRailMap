import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assertBoundaryRules } from './helpers/architectureBoundaryScanner.mjs';

const collectJsFiles = (relativeDir) => {
    const out = [];
    const walk = (dir) => {
        for (const name of readdirSync(join(process.cwd(), dir))) {
            const relativePath = `${dir}/${name}`.replace(/\\/g, '/');
            const stats = statSync(join(process.cwd(), relativePath));
            if (stats.isDirectory()) {
                walk(relativePath);
            } else if (relativePath.endsWith('.js')) {
                out.push(relativePath);
            }
        }
    };
    walk(relativeDir);
    return out;
};

const rawMapLibrePattern = /\bnew\s+maplibregl\b|\bmaplibregl\.|\.(addLayer|addSource|removeLayer|removeSource|setPaintProperty|setLayoutProperty|setFilter|queryRenderedFeatures|querySourceFeatures)\s*\(/;
const browserGlobalPattern = /\b(window|document)\s*\.|\bwindow\b|\bdocument\b/;
const domMutationPattern = /\b(querySelector|querySelectorAll|getElementById|createElement|createElementNS|appendChild|classList|addEventListener|dispatchEvent)\s*\(/;

const domainFiles = collectJsFiles('src/domain');
const storeFiles = collectJsFiles('src/store');
const uiFiles = collectJsFiles('src/ui');
const serviceFiles = collectJsFiles('src/services')
    .filter((file) => file !== 'src/services/mapEngine.js');

const featureCoreFiles = [
    'src/features/hover/hoverFeature.js',
    'src/features/highlight/highlightFeature.js',
    'src/features/highlight/multiSelectLayerItems.js',
    'src/features/layer/layerFeature.js',
    'src/features/layer/stationCoordinateAdapter.js',
    'src/features/layer/stationOffsetRuntimeController.js',
    'src/features/map-interactions/mapInteractionController.js',
    'src/features/route/routeFeature.js',
    'src/features/route/routePreviewBridgeApi.js',
    'src/features/route/routePreviewController.js',
    'src/features/route/routePreviewRuntimeController.js',
    'src/features/route/tripPreviewBuilder.js',
    'src/features/search/journeyComputeOrchestrator.js',
    'src/features/search/journeyPickController.js',
    'src/features/search/journeyPlanPreviewController.js',
    'src/features/search/reachableStopsController.js',
    'src/features/search/searchFeature.js',
    'src/features/search/searchSelectionController.js',
    'src/features/selection/panelSearchSelectionCallbacks.js',
    'src/features/selection/selectionEffectsController.js'
];

assertBoundaryRules([
    {
        files: domainFiles,
        pattern: /\b(window|document|maplibre|mapEngine|fetch|getCachedJson|TokyoRail)\b|\b(querySelector|querySelectorAll|getElementById|createElement|appendChild|classList)\s*\(/,
        message: 'domain files must stay pure: no browser globals, MapLibre/mapEngine, fetch/cache, or TokyoRail globals',
        allowComment: true
    },
    {
        files: storeFiles,
        pattern: new RegExp(`${browserGlobalPattern.source}|${rawMapLibrePattern.source}|\\bmapEngine\\b`),
        message: 'store files must not depend on browser globals, raw MapLibre, or mapEngine',
        allowComment: true
    },
    {
        files: uiFiles,
        pattern: rawMapLibrePattern,
        message: 'ui files must not call raw MapLibre APIs',
        allowComment: true
    },
    {
        files: featureCoreFiles,
        pattern: new RegExp(`${browserGlobalPattern.source}|${domMutationPattern.source}`),
        message: 'feature core files must not directly operate DOM or browser event globals',
        allowComment: true
    },
    {
        files: serviceFiles,
        pattern: rawMapLibrePattern,
        message: 'non-mapEngine service files must not call raw MapLibre APIs',
        allowComment: true
    }
]);

console.log('architecture boundary scanner smoke ok');

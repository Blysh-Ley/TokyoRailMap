import { assertNoPattern } from './helpers/architectureBoundaryScanner.mjs';

const layerFeatureFiles = [
    'src/features/layer/layerFeature.js'
];

const layerRuntimeFiles = [
    'src/features/layer/layerFeature.js',
    'src/features/layer/stationCoordinateAdapter.js',
    'src/features/layer/stationOffsetRuntimeController.js'
];

const layerUiAdapterFiles = [
    'src/ui/layer/stationLabelChipsAdapter.js'
];

assertNoPattern({
    files: layerFeatureFiles,
    pattern: /\b(document|window)\s*\.|\b(querySelector|querySelectorAll|createElement|appendChild|classList)\s*\(/,
    message: 'layerFeature must not directly operate DOM APIs'
});

assertNoPattern({
    files: layerRuntimeFiles,
    pattern: /\bnew\s+maplibregl\b|\bmaplibregl\.|\.(addLayer|addSource|removeLayer|removeSource|setPaintProperty|setLayoutProperty|setFilter|queryRenderedFeatures|querySourceFeatures)\s*\(/,
    message: 'layer runtime files must not call raw MapLibre APIs'
});

assertNoPattern({
    files: layerUiAdapterFiles,
    pattern: /\bnew\s+maplibregl\b|\bmaplibregl\.|\.(addLayer|addSource|removeLayer|removeSource|setPaintProperty|setLayoutProperty|setFilter|queryRenderedFeatures|querySourceFeatures)\s*\(/,
    message: 'layer UI adapters must not call raw MapLibre APIs'
});

console.log('layer runtime boundary smoke ok');

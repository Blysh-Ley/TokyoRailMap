import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

const assertNoPattern = ({ files, pattern, message }) => {
    const hits = [];
    for (const file of files) {
        const lines = read(file).split(/\r?\n/);
        lines.forEach((line, index) => {
            if (pattern.test(line)) {
                hits.push(`${file}:${index + 1}: ${line.trim()}`);
            }
        });
    }

    assert.equal(hits.length, 0, `${message}\n${hits.join('\n')}`);
};

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

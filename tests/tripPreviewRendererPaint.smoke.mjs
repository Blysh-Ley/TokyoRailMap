import assert from 'node:assert/strict';

import { createTripPreviewRenderer } from '../src/features/highlight/tripPreviewRenderer.js';

const layers = new Set();
const paintCalls = [];

const mapEngine = {
    applyPaintProperties(layerId, paint) {
        paintCalls.push([layerId, paint]);
        return true;
    },
    ensureGeoJsonSource() {},
    ensureLayer(layer) {
        layers.add(layer.id);
    },
    getLayer(layerId) {
        return layers.has(layerId) ? { id: layerId } : null;
    },
    moveLayer() {}
};

const renderer = createTripPreviewRenderer({
    mapEngine,
    getLinePaint: () => ({ 'line-width': 6 }),
    getStopPaint: () => ({ 'circle-radius': 5 })
});

renderer.ensureLayers();
assert.equal(paintCalls.length, 0);

renderer.ensureLayers();
assert.ok(paintCalls.some(([layerId, paint]) => layerId === 'trip-preview-line-layer' && paint['line-width'] === 6));
assert.ok(paintCalls.some(([layerId, paint]) => layerId === 'trip-preview-connector-layer' && paint['line-width'] === 6));

console.log('trip preview renderer paint smoke ok');

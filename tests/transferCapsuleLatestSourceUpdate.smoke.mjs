import assert from 'node:assert/strict';

import { addTransferCapsuleLayers } from '../src/map/transfer-capsules.js';

const createMapStub = () => {
    const layers = new Map();
    const sources = new Map();
    const latestSourceUpdateCalls = [];
    return {
        latestSourceUpdateCalls,
        addLayer(layer) {
            layers.set(layer.id, layer);
        },
        addSource(sourceId, source) {
            sources.set(sourceId, source);
        },
        getLayer(layerId) {
            return layers.get(layerId) || null;
        },
        getSource(sourceId) {
            return sources.get(sourceId) || null;
        },
        setPaintProperty() {},
        updateGeoJsonSourceDataLatest(sourceId, data) {
            latestSourceUpdateCalls.push({ sourceId, data });
        }
    };
};

const data = {
    lines: { type: 'FeatureCollection', features: [] },
    centroids: { type: 'FeatureCollection', features: [] },
    dots: { type: 'FeatureCollection', features: [] }
};
const mapEngine = createMapStub();

addTransferCapsuleLayers(mapEngine, data);
addTransferCapsuleLayers(mapEngine, data, { latestSourceUpdates: true });

assert.deepEqual(mapEngine.latestSourceUpdateCalls.map(({ sourceId }) => sourceId), [
    'transfer-capsule-lines-source',
    'transfer-capsule-centroids-source',
    'transfer-capsule-dots-source'
]);

console.log('transfer capsule latest source update smoke ok');

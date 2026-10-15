import assert from 'node:assert/strict';

import { createTripPreviewRenderer } from '../src/features/highlight/tripPreviewRenderer.js';

const layers = new Map([['stations-layer', { id: 'stations-layer' }]]);
const order = ['stations-layer'];
const paintCalls = [];
const moveCalls = [];
let lineWidth = 6;

const mapEngine = {
    applyPaintProperties(layerId, paint) {
        paintCalls.push([layerId, paint]);
        Object.assign(layers.get(layerId).paint, paint);
        return true;
    },
    ensureGeoJsonSource() {},
    ensureLayer(layer, beforeLayerId) {
        layers.set(layer.id, { ...layer, paint: { ...layer.paint } });
        order.splice(beforeLayerId ? order.indexOf(beforeLayerId) : order.length, 0, layer.id);
    },
    getLayer: (layerId) => layers.get(layerId) || null,
    getLayersOrder: () => order.slice(),
    moveLayer(layerId, beforeLayerId) {
        moveCalls.push([layerId, beforeLayerId]);
        order.splice(order.indexOf(layerId), 1);
        order.splice(order.indexOf(beforeLayerId), 0, layerId);
    }
};

const renderer = createTripPreviewRenderer({
    mapEngine,
    getLinePaint: () => ({ 'line-width': lineWidth }),
    getStopPaint: () => ({ 'circle-radius': 5 })
});

renderer.ensureLayers();
assert.equal(paintCalls.length, 0);
assert.deepEqual(order, [
    'trip-preview-line-layer', 'trip-preview-connector-layer', 'stations-layer', 'trip-preview-stops-layer'
]);

renderer.ensureLayers();
assert.deepEqual(paintCalls.map(([layerId]) => layerId), [
    'trip-preview-line-layer', 'trip-preview-connector-layer', 'trip-preview-stops-layer'
]);
assert.equal(moveCalls.length, 0, '层级未变时不应重新提交图层布局');

lineWidth = 8;
renderer.ensureLayers();
for (const id of ['trip-preview-line-layer', 'trip-preview-connector-layer']) {
    assert.equal(layers.get(id).paint['line-width'], 8, '重新确认图层时仍应用当前主题样式');
}
assert.equal(moveCalls.length, 0);

// 新出现的换乘胶囊改变了锚点，需要恢复两套线路图层的层级。
layers.set('transfer-capsule-outline-layer', { id: 'transfer-capsule-outline-layer' });
order.splice(0, 0, 'transfer-capsule-outline-layer');
renderer.ensureLayers();
assert.deepEqual(order.slice(0, 3), [
    'trip-preview-line-layer', 'trip-preview-connector-layer', 'transfer-capsule-outline-layer'
]);
assert.equal(moveCalls.length, 2);
renderer.ensureLayers();
assert.equal(moveCalls.length, 2);

// 图层被外部重排或重建后，仍能恢复正确结果。
order.splice(order.indexOf('trip-preview-line-layer'), 1);
order.push('trip-preview-line-layer');
renderer.ensureLayers();
assert.deepEqual(order.slice(0, 3), [
    'trip-preview-line-layer', 'trip-preview-connector-layer', 'transfer-capsule-outline-layer'
]);
layers.delete('trip-preview-connector-layer');
order.splice(order.indexOf('trip-preview-connector-layer'), 1);
renderer.ensureLayers();
assert.equal(layers.get('trip-preview-connector-layer').paint['line-width'], 8);
assert.deepEqual(order.slice(0, 3), [
    'trip-preview-line-layer', 'trip-preview-connector-layer', 'transfer-capsule-outline-layer'
]);

console.log('班次预览样式与图层提交检查通过');

import assert from 'node:assert/strict';
import { buildLineNameLabelGeoJSON } from '../src/domain/lineNameLabels.js';
import { addLineNameLabelsLayer } from '../src/map/layers.js';

const labels = buildLineNameLabelGeoJSON([
    {
        type: 'Feature',
        id: 'L1.18',
        properties: {
            id: 'L1',
            name: 'Yamanote Line',
            color: '#80c241',
            hidden_by_opacity_zero: 0
        },
        geometry: {
            type: 'LineString',
            coordinates: [[0, 0], [1, 0], [2, 0]]
        }
    },
    {
        type: 'Feature',
        id: 'L2.18',
        properties: {
            id: 'L2',
            name: 'Freight 货物 Line',
            color: '#000',
            hidden_by_opacity_zero: 0
        },
        geometry: {
            type: 'LineString',
            coordinates: [[10, 0], [11, 0]]
        }
    },
    {
        type: 'Feature',
        id: 'L3.18',
        properties: {
            id: 'L3',
            name: 'Airport 支线',
            color: '#333',
            hidden_by_opacity_zero: 0
        },
        geometry: {
            type: 'LineString',
            coordinates: [[12, 0], [13, 0]]
        }
    },
    {
        type: 'Feature',
        id: 'Base.L2.18',
        properties: {
            id: 'Base.L2',
            name: 'Base helper',
            color: '#999',
            hidden_by_opacity_zero: 0
        },
        geometry: {
            type: 'LineString',
            coordinates: [[3, 0], [4, 0]]
        }
    }
]);

assert.equal(labels.type, 'FeatureCollection');
assert.equal(labels.features.length, 1);
assert.deepEqual(labels.features[0], {
    type: 'Feature',
    id: 'L1.name-label',
    properties: {
        id: 'L1',
        name: 'Yamanote Line',
        color: '#80c241',
        type: 'line-name-label'
    },
    geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [1, 0], [2, 0]]
    }
});

const sources = new Map();
const layers = new Map([['lines-layer', { id: 'lines-layer' }]]);
const engine = {
    on: () => {},
    createPopup: () => ({}),
    getSource: (sourceId) => sources.get(sourceId),
    addSource: (sourceId, source) => sources.set(sourceId, source),
    hasLayer: (layerId) => layers.has(layerId),
    addLayer: (layer, beforeLayerId) => layers.set(layer.id, { layer, beforeLayerId })
};

addLineNameLabelsLayer(engine, labels);

assert.equal(sources.get('line-name-labels-source').data, labels);
const labelLayer = layers.get('line-name-labels-layer');
assert.equal(labelLayer.beforeLayerId, 'lines-layer');
assert.equal(labelLayer.layer.type, 'symbol');
assert.equal(labelLayer.layer.layout['symbol-placement'], 'line-center');
assert.deepEqual(labelLayer.layer.layout['text-field'], ['get', 'name']);
assert.deepEqual(labelLayer.layer.layout['text-font'], ['Open Sans Regular', 'Arial Unicode MS Regular']);
assert.deepEqual(labelLayer.layer.layout['text-offset'], [0, 1.25]);
assert.equal(labelLayer.layer.layout['text-keep-upright'], true);
assert.deepEqual(labelLayer.layer.paint['text-color'], ['coalesce', ['get', 'color'], '#2f6fdf']);
assert.equal(Object.hasOwn(labelLayer.layer.paint, 'text-halo-color'), false);
assert.equal(Object.hasOwn(labelLayer.layer.paint, 'background-color'), false);

console.log('line name labels smoke ok');

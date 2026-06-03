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
            line_offset_units: 2,
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
const [lineNameLabel] = labels.features;
assert.equal(lineNameLabel.properties.text_offset[0], 0);
assert.ok(lineNameLabel.properties.text_offset[1] > 1.25);
assert.deepEqual(lineNameLabel, {
    type: 'Feature',
    id: 'L1.name-label',
    properties: {
        id: 'L1',
        name: 'Yamanote Line',
        color: '#80c241',
        line_offset_units: 2,
        text_offset: lineNameLabel.properties.text_offset,
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
assert.equal(labelLayer.layer.layout['symbol-placement'], 'line');
assert.deepEqual(labelLayer.layer.layout['symbol-spacing'], ['interpolate', ['linear'], ['zoom'], 8, 450, 12, 900, 16, 1600]);
assert.equal(labelLayer.layer.layout['symbol-avoid-edges'], false);
assert.deepEqual(labelLayer.layer.layout['text-field'], ['get', 'name']);
assert.deepEqual(labelLayer.layer.layout['text-font'], ['Open Sans Regular', 'Arial Unicode MS Regular']);
assert.deepEqual(labelLayer.layer.layout['text-size'], ['interpolate', ['linear'], ['zoom'], 8, 9, 10, 10, 12, 12, 14, 15, 16, 17]);
assert.equal(labelLayer.layer.layout['text-letter-spacing'], 0.15);
assert.deepEqual(labelLayer.layer.layout['text-offset'], ['get', 'text_offset']);
assert.equal(labelLayer.layer.layout['text-max-angle'], 30);
assert.equal(labelLayer.layer.layout['text-keep-upright'], true);
assert.deepEqual(labelLayer.layer.paint['text-color'], ['coalesce', ['get', 'color'], '#2f6fdf']);
assert.deepEqual(labelLayer.layer.paint['text-halo-color'], ['coalesce', ['get', 'color'], '#2f6fdf']);
assert.equal(labelLayer.layer.paint['text-halo-width'], 0.35);
assert.equal(Object.hasOwn(labelLayer.layer.paint, 'background-color'), false);

console.log('line name labels smoke ok');

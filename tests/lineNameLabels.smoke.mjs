import assert from 'node:assert/strict';
import { buildLineNameLabelGeoJSON } from '../src/domain/lineNameLabels.js';
import {
    LINE_NAME_LABEL_TEXT_SIZE_EXPR,
    addLineNameLabelsLayer,
    getLineNameLabelTextSizeForZoom
} from '../src/map/layers.js';

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
            coordinates: [[0, 0], [0.01, 0], [0.02, 0]]
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
assert.equal(labels.features.length, 3);
const [lineNameLabel] = labels.features;
assert.equal(lineNameLabel.properties.text_offset[0], 0);
assert.ok(lineNameLabel.properties.text_offset[1] > 1.25);
assert.equal(lineNameLabel.type, 'Feature');
assert.equal(lineNameLabel.id, 'L1.name-label.candidate.1');
assert.deepEqual({
    id: lineNameLabel.properties.id,
    name: lineNameLabel.properties.name,
    color: lineNameLabel.properties.color,
    line_offset_units: lineNameLabel.properties.line_offset_units,
    text_offset: lineNameLabel.properties.text_offset,
    label_index: lineNameLabel.properties.label_index,
    label_count: lineNameLabel.properties.label_count,
    label_candidate_rank: lineNameLabel.properties.label_candidate_rank,
    type: lineNameLabel.properties.type
}, {
    id: 'L1',
    name: 'Yamanote Line',
    color: '#80c241',
    line_offset_units: 2,
    text_offset: lineNameLabel.properties.text_offset,
    label_index: 1,
    label_count: 3,
    label_candidate_rank: 1,
    type: 'line-name-label'
});
assert.ok(Array.isArray(lineNameLabel.properties.label_corridor_coordinates));
assert.ok(lineNameLabel.properties.label_corridor_coordinates.length >= 2);
assert.equal(typeof lineNameLabel.properties.label_corridor_bend, 'number');
assert.equal(typeof lineNameLabel.properties.label_corridor_directness, 'number');
assert.deepEqual(labels.features.map((feature) => feature.properties.label_index), [1, 2, 3]);
assert.deepEqual(labels.features.map((feature) => feature.properties.label_candidate_rank), [1, 2, 3]);
assert.equal(lineNameLabel.geometry.type, 'LineString');
assert.equal(lineNameLabel.geometry.coordinates.length, 2);
assert.ok(lineNameLabel.geometry.coordinates.every((coord) => coord.every(Number.isFinite)));
assert.notDeepEqual(lineNameLabel.geometry.coordinates, [[0, 0], [0.01, 0], [0.02, 0]]);

const longLabels = buildLineNameLabelGeoJSON([
    {
        type: 'Feature',
        id: 'L4.18',
        properties: {
            id: 'L4',
            name: 'Long Urban Line',
            color: '#123456',
            hidden_by_opacity_zero: 0
        },
        geometry: {
            type: 'LineString',
            coordinates: [[0, 1], [0.35, 1], [0.7, 1]]
        }
    }
]);
assert.equal(longLabels.features.length, 9);
assert.deepEqual(longLabels.features.map((feature) => feature.properties.label_index), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.deepEqual(new Set(longLabels.features.map((feature) => feature.properties.label_count)), new Set([9]));
assert.ok(longLabels.features.every((feature) => feature.geometry.type === 'LineString'));
assert.ok(longLabels.features.every((feature) => feature.geometry.coordinates.length === 2));

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
assert.equal(sources.get('line-name-labels-source').maxzoom, 8);
const labelLayer = layers.get('line-name-labels-layer');
assert.equal(labelLayer.beforeLayerId, 'lines-layer');
assert.equal(labelLayer.layer.type, 'symbol');
assert.equal(labelLayer.layer.layout['symbol-placement'], 'line-center');
assert.deepEqual(labelLayer.layer.layout['symbol-spacing'], ['interpolate', ['linear'], ['zoom'], 8, 300, 12, 800, 16, 1600]);
assert.equal(labelLayer.layer.layout['symbol-avoid-edges'], false);
assert.deepEqual(labelLayer.layer.layout['text-field'], ['get', 'name']);
assert.deepEqual(labelLayer.layer.layout['text-font'], ['Open Sans Regular', 'Arial Unicode MS Regular']);
assert.deepEqual(labelLayer.layer.layout['text-size'], LINE_NAME_LABEL_TEXT_SIZE_EXPR);
assert.equal(getLineNameLabelTextSizeForZoom(7.5), 5.5);
assert.equal(getLineNameLabelTextSizeForZoom(12), 9);
assert.equal(getLineNameLabelTextSizeForZoom(16), 11);
assert.equal(labelLayer.layer.layout['text-letter-spacing'], 0.15);
assert.deepEqual(labelLayer.layer.layout['text-offset'], ['get', 'text_offset']);
assert.equal(labelLayer.layer.layout['text-max-angle'], 40);
assert.equal(labelLayer.layer.layout['text-keep-upright'], true);
assert.equal(labelLayer.layer.layout['text-padding'], 2);
assert.deepEqual(labelLayer.layer.paint['text-color'], ['coalesce', ['get', 'color'], '#2f6fdf']);
assert.deepEqual(labelLayer.layer.paint['text-halo-color'], ['coalesce', ['get', 'color'], '#2f6fdf']);
assert.equal(labelLayer.layer.paint['text-halo-width'], 0.35);
assert.equal(Object.hasOwn(labelLayer.layer.paint, 'background-color'), false);

console.log('line name labels smoke ok');

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
        id: 'L1.18.opacity0',
        properties: {
            id: 'L1',
            name: 'Hidden duplicate',
            color: '#000',
            hidden_by_opacity_zero: 1
        },
        geometry: {
            type: 'LineString',
            coordinates: [[10, 0], [11, 0]]
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
        type: 'Point',
        coordinates: [1, 0]
    }
});

const markerRenderCalls = [];
const engine = {
    renderLineNameLabels: (geojson) => markerRenderCalls.push(geojson)
};

addLineNameLabelsLayer(engine, labels);

assert.deepEqual(markerRenderCalls, [labels]);

console.log('line name labels smoke ok');

import assert from 'node:assert/strict';
import {
    buildLineHighlightLabelItems,
    pickLineHighlightLabelCoordinate
} from '../src/domain/lineHighlightLabels.js';

assert.deepEqual(
    pickLineHighlightLabelCoordinate({
        type: 'LineString',
        coordinates: [[139, 35], [140, 35], [141, 35]]
    }),
    [140, 35]
);

assert.deepEqual(
    pickLineHighlightLabelCoordinate({
        type: 'MultiLineString',
        coordinates: [
            [[0, 0], [0.1, 0]],
            [[10, 10], [12, 10], [14, 10]]
        ]
    }),
    [12, 10]
);

const lineFeatureById = new Map([
    ['L1', {
        geometry: {
            type: 'LineString',
            coordinates: [[139, 35], [139.2, 35]]
        }
    }],
    ['L2', {
        geometry: {
            type: 'LineString',
            coordinates: [[140, 35], [140.1, 35], [140.2, 35]]
        }
    }]
]);

const items = buildLineHighlightLabelItems({
    lineIds: new Set(['L1', 'L2', 'L1', 'missing']),
    lineFeatureById,
    getLineColor: (lineId) => (lineId === 'L1' ? '#80c241' : '#009fe8'),
    getLineIconText: (lineId) => (lineId === 'L1' ? 'JY' : 'T'),
    getLineName: (lineId) => (lineId === 'L1' ? 'Yamanote Line' : 'Tozai Line')
});

assert.equal(items.length, 2);
assert.deepEqual(items[0], {
    lineId: 'L1',
    coordinate: [139.1, 35],
    lineName: 'Yamanote Line',
    iconText: 'JY',
    color: '#80c241'
});
assert.deepEqual(items[1], {
    lineId: 'L2',
    coordinate: [140.1, 35],
    lineName: 'Tozai Line',
    iconText: 'T',
    color: '#009fe8'
});

console.log('line highlight labels smoke ok');

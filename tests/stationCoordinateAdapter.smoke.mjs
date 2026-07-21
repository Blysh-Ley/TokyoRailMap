import assert from 'node:assert/strict';
import { createStationCoordinateAdapter } from '../src/features/layer/stationCoordinateAdapter.js';

const stations = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'S1',
            properties: { id: 'S1' },
            geometry: { type: 'Point', coordinates: [139.1, 35.1] }
        }
    ]
};

const markerCalls = [];
const label = {
    stationId: 'S1',
    coordinates: [0, 0],
    marker: {
        setLngLat(coordinates) {
            markerCalls.push(coordinates);
        }
    }
};
const circle = {
    stationId: 'S1',
    coordinates: [0, 0]
};

const adapter = createStationCoordinateAdapter({
    stationCircles: [circle],
    stationLabels: [label]
});

adapter.updateLabels(stations);
adapter.updateCircles(stations);

assert.deepEqual(label.coordinates, [139.1, 35.1]);
assert.deepEqual(circle.coordinates, [139.1, 35.1]);
assert.deepEqual(markerCalls, [[139.1, 35.1]]);

console.log('station coordinate adapter smoke ok');

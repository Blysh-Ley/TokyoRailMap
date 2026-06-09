import assert from 'node:assert/strict';

import { collectPanelTripDetailTripChainByTrip } from '../src/features/panel/panelTripDetailTripChainWalker.js';

const tripByRefId = new Map([
    ['ref-a', { id: 'trip-a', nt: ['ref-b'] }],
    ['ref-b', { id: 'trip-b', nt: ['ref-c'] }],
    ['ref-c', { id: 'trip-c', nt: ['ref-c'] }],
    ['pt-a', { id: 'pt-trip-a', pt: ['pt-b'] }],
    ['pt-b', { id: 'pt-trip-b', pt: [] }]
]);

const loadTripByRefId = async (refId) => tripByRefId.get(refId) || null;

assert.deepEqual(
    (await collectPanelTripDetailTripChainByTrip({
        startTrip: { nt: ['ref-a'] },
        key: 'nt',
        loadTripByRefId,
        isTokenCurrent: () => true
    })).map((trip) => trip.id),
    ['trip-a', 'trip-b', 'trip-c']
);

assert.deepEqual(
    (await collectPanelTripDetailTripChainByTrip({
        startTrip: { pt: ['pt-a'] },
        key: 'pt',
        loadTripByRefId,
        isTokenCurrent: () => true
    })).map((trip) => trip.id),
    ['pt-trip-a', 'pt-trip-b']
);

let loadCount = 0;
assert.equal(
    await collectPanelTripDetailTripChainByTrip({
        startTrip: { nt: ['ref-a'] },
        key: 'nt',
        loadTripByRefId: async (refId) => {
            loadCount += 1;
            return tripByRefId.get(refId) || null;
        },
        isTokenCurrent: () => loadCount < 2
    }),
    null
);

console.log('panel trip-detail trip chain walker smoke ok');

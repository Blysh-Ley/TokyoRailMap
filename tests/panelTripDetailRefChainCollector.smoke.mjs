import assert from 'node:assert/strict';

import {
    collectPanelTripDetailRefChainTripsFromRef,
    resolvePanelTripDetailFirstMultiRefsAlongChain
} from '../src/features/panel/panelTripDetailRefChainCollector.js';

const tripByRefId = new Map([
    ['ref-a', { id: 'trip-a', nt: ['ref-b'] }],
    ['ref-b', { id: 'trip-b', nt: ['ref-c', 'ref-d'] }],
    ['ref-c', { id: 'trip-c', nt: ['ref-c'] }],
    ['pt-a', { id: 'pt-trip-a', pt: ['pt-b'] }],
    ['pt-b', { id: 'pt-trip-b', pt: [] }]
]);

const loadTripByRefId = async (refId) => tripByRefId.get(refId) || null;

assert.deepEqual(
    (await collectPanelTripDetailRefChainTripsFromRef({
        startRefId: 'ref-a',
        key: 'nt',
        loadTripByRefId,
        isTokenCurrent: () => true
    })).map((trip) => trip.id),
    ['trip-a', 'trip-b', 'trip-c']
);

assert.deepEqual(
    await resolvePanelTripDetailFirstMultiRefsAlongChain({
        startRefId: 'ref-a',
        key: 'nt',
        loadTripByRefId,
        isTokenCurrent: () => true
    }),
    ['ref-c', 'ref-d']
);

assert.deepEqual(
    await resolvePanelTripDetailFirstMultiRefsAlongChain({
        startRefId: 'pt-a',
        key: 'pt',
        loadTripByRefId,
        isTokenCurrent: () => true
    }),
    []
);

let loadCount = 0;
assert.equal(
    await collectPanelTripDetailRefChainTripsFromRef({
        startRefId: 'ref-a',
        key: 'nt',
        loadTripByRefId: async (refId) => {
            loadCount += 1;
            return tripByRefId.get(refId) || null;
        },
        isTokenCurrent: () => loadCount < 2
    }),
    null
);

assert.equal(
    await resolvePanelTripDetailFirstMultiRefsAlongChain({
        startRefId: 'ref-a',
        key: 'nt',
        loadTripByRefId: async (refId) => {
            loadCount += 1;
            return tripByRefId.get(refId) || null;
        },
        isTokenCurrent: () => loadCount < 2
    }),
    null
);

console.log('panel trip-detail ref chain collector smoke ok');

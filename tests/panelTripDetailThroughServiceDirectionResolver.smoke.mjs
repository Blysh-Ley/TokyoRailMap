import assert from 'node:assert/strict';

import { derivePanelTripDetailThroughServiceDirection } from '../src/features/panel/panelTripDetailThroughServiceDirectionResolver.js';

const throughServiceConfigs = [
    {
        tempId: 'temp-line',
        directionRule: {
            southNode: 'South',
            northNode: 'North'
        }
    }
];

const tripByRefId = new Map([
    ['pt-1', { id: 'pt-1', pt: [], tt: [{ s: 'X.South' }] }],
    ['nt-1', { id: 'nt-1', nt: [], tt: [{ s: 'X.North' }] }],
    ['nt-2', { id: 'nt-2', nt: [], tt: [{ s: 'X.South' }] }]
]);

assert.equal(
    await derivePanelTripDetailThroughServiceDirection({
        trip: {
            pt: ['pt-1'],
            nt: ['nt-1'],
            tt: [{ s: 'X.Center' }]
        },
        displayLineId: 'temp-line',
        throughServiceConfigs,
        loadTripByRefId: async (refId) => tripByRefId.get(refId) || null,
        isTokenCurrent: () => true
    }),
    'Northbound'
);

assert.equal(
    await derivePanelTripDetailThroughServiceDirection({
        trip: {
            pt: [],
            nt: ['nt-2'],
            tt: [{ s: 'X.North' }]
        },
        displayLineId: 'temp-line',
        throughServiceConfigs,
        loadTripByRefId: async (refId) => tripByRefId.get(refId) || null,
        isTokenCurrent: () => true
    }),
    'Southbound'
);

assert.equal(
    await derivePanelTripDetailThroughServiceDirection({
        trip: { tt: [{ s: 'X.Center' }] },
        displayLineId: 'unknown-line',
        throughServiceConfigs,
        loadTripByRefId: async () => null,
        isTokenCurrent: () => true
    }),
    ''
);

let loadCount = 0;
assert.equal(
    await derivePanelTripDetailThroughServiceDirection({
        trip: {
            pt: ['pt-1'],
            nt: ['nt-1'],
            tt: [{ s: 'X.Center' }]
        },
        displayLineId: 'temp-line',
        throughServiceConfigs,
        loadTripByRefId: async (refId) => {
            loadCount += 1;
            return tripByRefId.get(refId) || null;
        },
        isTokenCurrent: () => loadCount < 2
    }),
    null
);

console.log('panel trip-detail through-service direction resolver smoke ok');

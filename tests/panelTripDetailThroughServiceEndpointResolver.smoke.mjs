import assert from 'node:assert/strict';

import {
    getPanelTripDetailStationIds,
    resolvePanelTripDetailThroughServiceEndpointIds
} from '../src/features/panel/panelTripDetailThroughServiceEndpointResolver.js';

assert.deepEqual(
    getPanelTripDetailStationIds(['A', 'B', 'A', '', null]),
    ['A', 'B']
);

const tripByRefId = new Map([
    ['pt-1', { id: 'pt-1', os: ['Origin.B'], pt: [] }],
    ['nt-1', { id: 'nt-1', ds: ['Terminal.B'], nt: [] }],
    ['nt-2', { id: 'nt-2', ds: ['Terminal.C'], nt: [] }]
]);

assert.deepEqual(
    await resolvePanelTripDetailThroughServiceEndpointIds({
        trip: {
            id: 'main',
            os: ['Origin.A'],
            ds: ['Terminal.A'],
            pt: ['pt-1'],
            nt: ['nt-1']
        },
        loadTripByRefId: async (refId) => tripByRefId.get(refId) || null
    }),
    {
        originId: 'Origin.B',
        terminalId: 'Terminal.B',
        terminalIds: ['Terminal.B']
    }
);

assert.deepEqual(
    await resolvePanelTripDetailThroughServiceEndpointIds({
        trip: {
            id: 'main-multi',
            os: ['Origin.A'],
            ds: ['Terminal.A', 'Terminal.B'],
            nt: ['nt-1', 'nt-2']
        },
        loadTripByRefId: async (refId) => tripByRefId.get(refId) || null
    }),
    {
        originId: 'Origin.A',
        terminalId: 'Terminal.B',
        terminalIds: ['Terminal.B', 'Terminal.C']
    }
);

const loopTripByRefId = new Map([
    ['same', { id: 'same', ds: ['Loop.Terminal'], nt: ['same'] }]
]);

assert.deepEqual(
    await resolvePanelTripDetailThroughServiceEndpointIds({
        trip: {
            id: 'loop-main',
            ds: ['Start.Terminal'],
            nt: ['same']
        },
        loadTripByRefId: async (refId) => loopTripByRefId.get(refId) || null
    }),
    {
        originId: '',
        terminalId: 'Loop.Terminal',
        terminalIds: ['Loop.Terminal']
    }
);

console.log('panel trip-detail through-service endpoint resolver smoke ok');

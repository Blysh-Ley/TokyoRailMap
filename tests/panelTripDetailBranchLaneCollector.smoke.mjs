import assert from 'node:assert/strict';

import { collectPanelTripDetailBranchLanesFromRefs } from '../src/features/panel/panelTripDetailBranchLaneCollector.js';

const normalResult = await collectPanelTripDetailBranchLanesFromRefs({
    refIds: ['ref-a', 'ref-b', ''],
    kind: 'nt',
    collectRefChainTripsFromRef: async (refId, kind) => {
        if (refId === 'ref-b') return [];
        return [
            {
                id: `${refId}-trip`,
                lineId: `line-${kind}`,
                d: 'north',
                typeName: 'local',
                typeColor: '#11aa11'
            }
        ];
    },
    isTokenCurrent: () => true,
    buildRowsForTrip: (trip) => [
        { stationId: `${trip.id}-s1`, stationName: 'A' },
        { stationId: `${trip.id}-s2`, stationName: 'B' }
    ],
    mergeStops: (left, right) => [...left, ...right],
    getTripLineId: (trip) => trip?.lineId || '',
    buildLineDescriptor: (lineId) => ({ text: lineId, color: '#00aa00' }),
    buildRefLineDescriptor: (refId) => ({ text: refId, color: '#cccccc' }),
    getTripTypeName: (trip) => trip?.typeName || '',
    getTripTypeColor: (trip) => trip?.typeColor || '',
    trainTypesIndex: new Map(),
    trainTypeColorIndex: new Map()
});

assert.equal(normalResult.length, 1);
assert.equal(normalResult[0].sourceRefId, 'ref-a');
assert.equal(normalResult[0].lineId, 'line-nt');
assert.deepEqual(normalResult[0].rows.map((row) => row.stationId), ['ref-a-trip-s1', 'ref-a-trip-s2']);

let staleCount = 0;
const staleResult = await collectPanelTripDetailBranchLanesFromRefs({
    refIds: ['ref-a', 'ref-b'],
    kind: 'pt',
    collectRefChainTripsFromRef: async (refId) => {
        staleCount += 1;
        return [{ id: `${refId}-trip`, lineId: 'line-pt' }];
    },
    isTokenCurrent: () => staleCount < 2,
    buildRowsForTrip: () => [],
    mergeStops: (left) => left,
    getTripLineId: (trip) => trip?.lineId || '',
    buildLineDescriptor: () => null,
    buildRefLineDescriptor: () => null,
    getTripTypeName: () => '',
    getTripTypeColor: () => '',
    trainTypesIndex: new Map(),
    trainTypeColorIndex: new Map()
});

assert.equal(staleResult, null);

console.log('panel trip-detail branch lane collector smoke ok');

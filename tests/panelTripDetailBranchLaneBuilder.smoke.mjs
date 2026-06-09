import assert from 'node:assert/strict';

import { buildPanelTripDetailBranchLaneFromChain } from '../src/features/panel/panelTripDetailBranchLaneBuilder.js';

const lane = buildPanelTripDetailBranchLaneFromChain({
    chainTrips: [
        { id: 'trip-a', lineId: 'JR.Yamanote', d: 'north', typeName: 'local', typeColor: '#11aa11' },
        { id: 'trip-b', lineId: 'JR.Yamanote', d: 'north', typeName: 'local', typeColor: '#11aa11' }
    ],
    kind: 'nt',
    sourceRefId: 'ref-a',
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

assert.equal(lane.kind, 'nt');
assert.equal(lane.lineId, 'JR.Yamanote');
assert.equal(lane.sourceRefId, 'ref-a');
assert.equal(lane.d, 'north');
assert.equal(lane.descriptor.text, 'JR.Yamanote');
assert.equal(lane.typeName, 'local');
assert.equal(lane.typeColor, '#11aa11');
assert.equal(lane.rows.length, 4);
assert.equal(lane.previewSegments.length, 2);
assert.deepEqual(lane.previewSegments[0].stationIds, ['trip-a-s1', 'trip-a-s2']);

assert.equal(
    buildPanelTripDetailBranchLaneFromChain({ chainTrips: [], kind: 'nt', sourceRefId: 'ref-a' }),
    null
);

console.log('panel trip-detail branch lane builder smoke ok');

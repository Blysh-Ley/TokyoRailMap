import assert from 'node:assert/strict';

import { buildReachableStopsTimetableIndex } from '../src/domain/reachableStops/timetableIndex.js';
import { buildReachableStopsQueryIndex } from '../src/domain/reachableStops/queryIndex.js';
import { scanReachableStopsByDepartureOpportunity } from '../src/domain/reachableStops/opportunityPlanner.js';
import {
    packReachableStopsWorkerTimetableIndex,
    unpackReachableStopsWorkerTimetableIndex
} from '../src/domain/reachableStops/workerTimetableIndex.js';

const id = (name) => `WorkerPacket.${name}.Weekday`;
const trip = (name, stops, next = []) => ({
    tripId: id(name), rawTripId: id(name), ntRefs: next.map(id),
    stops: stops.map(([stopId, arrMin, depMin = arrMin]) => ({ stopId, arrMin, depMin }))
});
const makeIndex = ({ trips, groups = [], transfers = new Map() }) => {
    const groupByStop = new Map();
    for (const members of groups) {
        const group = new Set(members);
        for (const stopId of group) groupByStop.set(stopId, group);
    }
    return buildReachableStopsTimetableIndex({
        serviceDay: 'Weekday', trips, groupByStop, transferSourcesByTargetStop: transfers
    });
};
const countAt = (result, stopId) => result.remainingMsByStop.get(stopId)?.at(-1)?.count || 0;
const comparePacket = async (index, options) => {
    const packet = packReachableStopsWorkerTimetableIndex(index);
    assert.ok(packet.connectionTripNumbers instanceof Uint32Array);
    assert.ok(packet.connectionArrivalMinutes instanceof Float64Array);
    assert.ok(packet.tripConnectionLengths instanceof Int32Array);
    assert.equal('tripById' in packet, false);
    assert.equal('connections' in packet, false);
    const restored = unpackReachableStopsWorkerTimetableIndex(structuredClone(packet));
    assert.deepEqual(Object.keys(restored).sort(), [
        'serviceDay', 'connections', 'connectionsByTripId', 'tripById',
        'groupKeyByStop', 'stationIdsByGroupKey', 'transferSourcesByTargetStop', 'throughEdgesFromTripId'
    ].sort());
    const tripIds = Array.from(index.tripById.keys());
    const tripNumbers = new Map(tripIds.map((tripId, number) => [tripId, number]));
    assert.equal(restored.connections.length, index.connections.length);
    for (let position = 0; position < index.connections.length; position += 1) {
        const original = index.connections[position];
        const connection = restored.connections[position];
        assert.equal(typeof original.tripId, 'string', 'packing must not mutate the source trip key');
        assert.deepEqual(connection, {
            ...original, id: original.scanIndex, tripId: tripNumbers.get(original.tripId)
        });
        assert.equal(restored.connectionsByTripId.get(connection.tripId)[connection.fromIndex], connection);
    }
    for (let number = 0; number < tripIds.length; number += 1) {
        const original = index.tripById.get(tripIds[number]);
        assert.deepEqual(restored.tripById.get(number), {
            stops: original.stops.map(({ arrMin, depMin }) => ({ arrMin, depMin }))
        });
        const rows = index.connectionsByTripId.get(tripIds[number]);
        if (!rows) assert.equal(restored.connectionsByTripId.has(number), false);
        else {
            const restoredRows = restored.connectionsByTripId.get(number);
            assert.equal(restoredRows.length, rows.length);
            for (let position = 0; position < rows.length; position += 1) {
                assert.equal(position in restoredRows, position in rows, 'leading, internal and trailing holes must remain holes');
            }
        }
    }
    for (const [sourceTripId, edges] of index.throughEdgesFromTripId) {
        assert.deepEqual(restored.throughEdgesFromTripId.get(tripNumbers.get(sourceTripId)), edges.map((edge) => ({
            sourceTripId: tripNumbers.get(sourceTripId),
            targetTripId: tripNumbers.get(edge.targetTripId),
            targetEntryIndex: edge.targetEntryIndex
        })));
    }
    let result;
    for (const mode of [
        { optimizeTransferChecks: false },
        { optimizeTransferChecks: true },
        { optimizeTransferChecks: true, groupEquivalentStates: true }
    ]) {
        const settings = { ...options, ...mode, yieldEveryConnections: Number.MAX_SAFE_INTEGER };
        const original = await scanReachableStopsByDepartureOpportunity({ ...settings, index });
        result = await scanReachableStopsByDepartureOpportunity({ ...settings, index: restored });
        assert.deepEqual(result, original, 'worker encoding must preserve all opportunity IDs, buckets and metadata');
    }
    return { packet, restored, result };
};

// The trip forbidden during the last transfer is numeric key 0 after decoding.
// Its long dwell prevents staying onboard, so treating zero as null is visible.
for (const includeAlternative of [false, true]) {
    const index = makeIndex({
        trips: [
            trip('NumericZero', [['B', 4], ['X', 10, 45], ['END', 46]]),
            trip('Origin', [['O', 0], ['A', 1]]),
            trip('FirstTransfer', [['A', 2], ['B', 3]]),
            ...(includeAlternative ? [trip('Alternative', [['B', 4], ['X', 12]])] : [])
        ],
        transfers: new Map([['X', [{ stopId: 'X', penaltyMin: 5 }]]])
    });
    const { restored, result } = await comparePacket(index, { originStationId: 'O', minutes: 60 });
    assert.ok(restored.tripById.has(0));
    assert.equal(restored.connections[0].id, 0, 'connection ID zero remains a valid origin departure');
    assert.equal(countAt(result, 'END'), includeAlternative ? 1 : 0);
}

{
    const index = makeIndex({ trips: [
        trip('OverlapSource', [['O', 0], ['A', 2], ['B', 4]], ['OverlapTarget', 'Branch']),
        trip('OverlapTarget', [['O', 0], ['A', 2], ['B', 4], ['C', 6]]),
        trip('Branch', [['B', 4], ['D', 5]])
    ] });
    const { restored, result } = await comparePacket(index, { originStationId: 'O', minutes: 15 });
    assert.equal(restored.throughEdgesFromTripId.get(0).find((edge) => edge.targetTripId === 1).targetEntryIndex, 2);
    assert.equal(countAt(result, 'C'), 1);
    assert.equal(countAt(result, 'D'), 1);
}

{
    const trips = Array.from({ length: 81 }, (_, number) => trip(`Chain${number}`,
        [[`S${number}`, number], [`S${number + 1}`, number + 1]], number < 80 ? [`Chain${number + 1}`] : []));
    const { result } = await comparePacket(makeIndex({ trips }), { originStationId: 'S0', minutes: 80 });
    assert.equal(countAt(result, 'S81'), 1, 'all 81 through segments survive the flat stop representation');
}

{
    const index = makeIndex({ trips: [
        trip('ReturnOrigin', [['O', 0], ['X', 1], ['R', 100], ['O', 100], ['F', 110]])
    ] });
    const options = { originStationId: 'O', minutes: 30 };
    const filtered = buildReachableStopsQueryIndex({ index, ...options });
    const { restored, result } = await comparePacket(filtered, options);
    assert.equal(restored.connections[1].scanIndex, 3);
    assert.equal(restored.connectionsByTripId.get(0).length, 4);
    assert.equal(1 in restored.connectionsByTripId.get(0), false);
    assert.equal(2 in restored.connectionsByTripId.get(0), false);
    assert.equal(countAt(result, 'F'), 1);
}

{
    const gap = trip('NoConnections', [['Z', 0], ['Q', 1]]);
    gap.stops[0].hasDeparture = false;
    const { packet, restored } = await comparePacket(makeIndex({ trips: [
        gap, trip('RealTrip', [['O', 0], ['A', 1]])
    ] }), { originStationId: 'O', minutes: 30 });
    assert.equal(packet.tripConnectionLengths[0], -1);
    assert.equal(restored.connectionsByTripId.has(0), false);
}

{
    const trips = Array.from({ length: 66 }, (_, number) => trip(`Opportunity${number}`,
        [['O', number], ['A', number + 1]]));
    const { result } = await comparePacket(makeIndex({ trips }), { originStationId: 'O', minutes: 30 });
    assert.equal(countAt(result, 'A'), 66, 'component strings and the final partial batch retain every departure opportunity');
    assert.ok(result.remainingMsByStop.get('A')[0].tripId.includes('WorkerPacket.'));
}

console.log('reachable stops worker timetable index smoke ok');

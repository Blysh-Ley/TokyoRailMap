import assert from 'node:assert/strict';

import { buildReachableStopsTimetableIndex } from '../src/domain/reachableStops/timetableIndex.js';
import { buildReachableStopsQueryIndex } from '../src/domain/reachableStops/queryIndex.js';
import { scanReachableStopsByDepartureOpportunity } from '../src/domain/reachableStops/opportunityPlanner.js';

const id = (name) => `QueryIndex.${name}.Weekday`;
const trip = (name, stops, next = []) => ({
    tripId: id(name),
    rawTripId: id(name),
    ntRefs: next.map(id),
    stops: stops.map(([stopId, arrMin, depMin = arrMin]) => ({ stopId, arrMin, depMin }))
});
const buildIndex = ({ trips, groups = [], transfers = new Map() }) => {
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
const scan = (index, options, mode) => scanReachableStopsByDepartureOpportunity({
    index,
    ...options,
    ...mode,
    yieldEveryConnections: Number.MAX_SAFE_INTEGER
});
const compareFiltered = async (fixture, options) => {
    const index = buildIndex(fixture);
    const originalConnections = index.connections.slice();
    const filtered = buildReachableStopsQueryIndex({ index, ...options });
    assert.deepEqual(index.connections, originalConnections, 'the cached index must not be mutated');
    assert.equal(filtered.tripById.size, new Set(filtered.connections.map((connection) => connection.tripId)).size);
    for (const [tripId, retainedTrip] of filtered.tripById) {
        assert.equal(retainedTrip, index.tripById.get(tripId), 'retained trip stop arrays must remain complete and unchanged');
    }
    for (const [sourceTripId, edges] of filtered.throughEdgesFromTripId) {
        assert.ok(filtered.tripById.has(sourceTripId));
        for (const edge of edges) {
            assert.ok(filtered.tripById.has(edge.targetTripId));
            assert.ok(index.throughEdgesFromTripId.get(sourceTripId).includes(edge));
        }
    }
    assert.ok(filtered.filterStats.applied);
    for (const connection of filtered.connections) {
        assert.equal(connection, originalConnections[connection.scanIndex]);
        assert.equal(filtered.connectionsByTripId.get(connection.tripId)[connection.fromIndex], connection);
    }
    let result;
    for (const mode of [
        { optimizeTransferChecks: false },
        { optimizeTransferChecks: true },
        { optimizeTransferChecks: true, groupEquivalentStates: true }
    ]) {
        const reference = await scan(index, options, mode);
        result = await scan(filtered, options, mode);
        assert.deepEqual(result, reference, 'filtering must preserve the complete result in every scan mode');
    }
    return { index, filtered, result };
};

{
    const { filtered, result } = await compareFiltered({
        trips: [
            trip('Boundary', [['O', 0], ['A', 35], ['B', 36]]),
            trip('Disconnected', [['Z', 0], ['Q', 1]])
        ]
    }, { originStationId: 'O', minutes: 30 });
    assert.equal(countAt(result, 'A'), 1);
    assert.equal(countAt(result, 'B'), 0);
    assert.equal(filtered.filterStats.removedConnectionCount, 2);
    assert.equal(filtered.tripById.has(id('Disconnected')), false);
    assert.equal(filtered.connectionsByTripId.get(id('Boundary')).length, 2);
    assert.equal(filtered.connectionsByTripId.get(id('Boundary'))[1], undefined);
}

{
    const { filtered, result } = await compareFiltered({
        trips: [
            trip('WalkOrigin', [['O', 0], ['A', 10]]),
            trip('WalkTarget', [['S', 15], ['C', 20], ['D', 21]]),
            trip('WaitIgnored', [['S', 100], ['LATE', 105]])
        ],
        transfers: new Map([['S', [{ stopId: 'A', penaltyMin: 5 }]]])
    }, { originStationId: 'O', minutes: 15 });
    assert.equal(countAt(result, 'C'), 1);
    assert.equal(countAt(result, 'D'), 0);
    assert.equal(countAt(result, 'LATE'), 0);
    assert.ok(filtered.connections.some((connection) => connection.tripId === id('WaitIgnored')),
        'the lower bound may retain a connection whose real waiting time is too long');
}

{
    const { filtered, result } = await compareFiltered({
        trips: [
            trip('ThroughOrigin', [['O', 0], ['A', 10]], ['ThroughTarget']),
            trip('ThroughTarget', [['B', 10], ['C', 20]])
        ],
        groups: [['A', 'B']]
    }, { originStationId: 'O', minutes: 15 });
    assert.equal(countAt(result, 'C'), 1, 'verified through boundaries need their zero-cost graph edge');
    assert.equal(filtered.filterStats.removedConnectionCount, 0);
}

// A and B start one opportunity at the same clock time in one through component.
// B's path inherits A's zero walk, so its X30->C33 leg must not be priced at 43.
{
    const { filtered, result } = await compareFiltered({
        trips: [
            trip('PlatformA', [['A', 0], ['J', 34]], ['Tail']),
            trip('PlatformB', [['B', 0], ['X', 30], ['C', 33], ['J', 34]], ['Tail']),
            trip('Tail', [['J', 34], ['END', 35]]),
            trip('TooLongOrigin', [['B', 100], ['FAR', 200]])
        ],
        groups: [['A', 'B']]
    }, { originStationId: 'A', minutes: 30, sourceStops: new Map([['A', 0], ['B', 10]]) });
    assert.equal(filtered.filterStats.seedWalkMinutes, 0);
    assert.equal(countAt(result, 'C'), 1);
    assert.ok(filtered.connections.some((connection) => connection.tripId === id('TooLongOrigin')),
        'every source departure must survive, including an over-budget first leg');
}

{
    const { filtered, result } = await compareFiltered({
        trips: [trip('ReturnOrigin', [['O', 0], ['X', 1], ['R', 100], ['O', 100], ['F', 110]])]
    }, { originStationId: 'O', minutes: 30 });
    const rows = filtered.connectionsByTripId.get(id('ReturnOrigin'));
    assert.equal(rows[1], undefined);
    assert.equal(rows[2], undefined);
    assert.equal(rows[3].fromStopId, 'O');
    assert.equal(countAt(result, 'F'), 1, 'a later return to the origin remains a separate start opportunity');
}

{
    const { filtered, result } = await compareFiltered({
        trips: [
            trip('ThroughBudget', [['O', 0], ['A', 35]], ['BeyondBudget']),
            trip('BeyondBudget', [['A', 35], ['B', 36]], ['BeyondTail']),
            trip('BeyondTail', [['B', 36], ['C', 37]])
        ]
    }, { originStationId: 'O', minutes: 30 });
    assert.equal(countAt(result, 'A'), 1);
    assert.equal(countAt(result, 'B'), 0);
    assert.deepEqual([...filtered.tripById.keys()], [id('ThroughBudget')]);
    assert.equal(filtered.throughEdgesFromTripId.size, 0);
}

{
    const gap = trip('Gap', [['A', 1], ['B', 2]], ['GapTail']);
    gap.stops[0].hasDeparture = false;
    const { filtered, result } = await compareFiltered({
        trips: [
            trip('GapOrigin', [['O', 0], ['A', 1]], ['Gap']),
            gap,
            trip('GapTail', [['B', 2], ['C', 3]])
        ]
    }, { originStationId: 'O', minutes: 30 });
    assert.equal(countAt(result, 'C'), 0, 'a through trip with no consumable connection cannot bridge to its own successor');
    assert.deepEqual([...filtered.tripById.keys()], [id('GapOrigin')]);
    assert.equal(filtered.throughEdgesFromTripId.size, 0);
}

console.log('reachable stops query index smoke ok');

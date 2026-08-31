import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    getReachableStopsLastMileRadiusMeters,
    getReachableStopsMaxEnvelopeMinutes,
    getReachableStopsPlanningBudgetMinutes
} from '../src/domain/reachableStops/rules.js';
import {
    buildReachableStopsTimetableIndex,
    isTripInStrictServiceDay,
    parseReachableStopsStrictTrip,
    parseReachableStopsTimetableMinute
} from '../src/domain/reachableStops/timetableIndex.js';
import {
    scanReachableStopsByDepartureOpportunity
} from '../src/domain/reachableStops/opportunityPlanner.js';
import { buildReachableStopsOverlayGeoJSON } from '../src/features/search/reachableStopsRuntime.js';

const makeGroupIndex = (...groups) => {
    const result = new Map();
    for (const group of groups) {
        const fixed = new Set(group);
        for (const stopId of fixed) result.set(stopId, fixed);
    }
    return result;
};

const makeTrip = ({ id, stops, nt = [], pt = [] }) => ({
    tripId: id,
    rawTripId: id,
    ntRefs: nt,
    ptRefs: pt,
    stops: stops.map(([stopId, arrMin, depMin = arrMin]) => ({ stopId, arrMin, depMin }))
});

const buildIndex = ({ trips, groups = [], transfers = new Map() }) => (
    buildReachableStopsTimetableIndex({
        serviceDay: 'Weekday',
        trips,
        groupByStop: makeGroupIndex(...groups),
        transferSourcesByTargetStop: transfers
    })
);

const scan = (index, originStationId, minutes, sourceStops = null, options = {}) => (
    scanReachableStopsByDepartureOpportunity({
        index,
        originStationId,
        minutes,
        sourceStops,
        optimizeTransferChecks: true,
        groupEquivalentStates: true,
        ...options,
        yieldControl: async () => {},
        yieldEveryConnections: Number.MAX_SAFE_INTEGER
    })
);

const lastCount = (payload, stopId) => {
    const circles = payload.remainingMsByStop.get(stopId) || [];
    return circles.at(-1)?.count || 0;
};

const readTrips = async (fileName) => JSON.parse(await readFile(
    new URL(`../data/train-timetables/${fileName}`, import.meta.url),
    'utf8'
));

assert.equal(getReachableStopsPlanningBudgetMinutes(30), 35);
assert.equal(getReachableStopsLastMileRadiusMeters(0), 250);
assert.equal(getReachableStopsLastMileRadiusMeters(30), 1000);
assert.equal(getReachableStopsMaxEnvelopeMinutes(30), 40);

assert.equal(isTripInStrictServiceDay('X.Line.1.Weekday', 'Weekday'), true);
assert.equal(isTripInStrictServiceDay('X.Line.1.Weekday.2', 'Weekday'), true);
assert.equal(isTripInStrictServiceDay('X.Line.1.SaturdayHoliday', 'Weekday'), false);
assert.equal(isTripInStrictServiceDay('X.Line.1.Saturday', 'Weekday'), false);
assert.equal(isTripInStrictServiceDay('X.Line.1.Holiday', 'Weekday'), false);
assert.equal(isTripInStrictServiceDay('X.Line.1', 'Weekday'), false);
assert.equal(parseReachableStopsTimetableMinute('24:00'), 1260);
assert.equal(parseReachableStopsTimetableMinute('00:01'), 1261);

{
    const parsed = parseReachableStopsStrictTrip({
        id: 'X.Line.1.Weekday',
        tt: [{ s: 'O', d: '23:59' }, { s: 'D', a: '24:00' }]
    });
    assert.equal(parsed.stops[0].hasDeparture, true);
    assert.equal(parsed.stops[1].hasDeparture, false);
    assert.equal(parsed.stops[1].arrMin, 1260);
}

{
    const firstId = 'X.First.1.Weekday';
    const secondId = 'X.Second.1.Weekday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: firstId, nt: [secondId], stops: [['O', 0, 0], ['XA', 10, 10]] }),
            makeTrip({
                id: secondId,
                pt: [firstId],
                stops: [['XB', 11, 11], ['D', 35, 35], ['TOO_LATE', 36, 36]]
            })
        ],
        groups: [['XA', 'XB']]
    });
    assert.equal(index.throughEdges.length, 1);
    assert.equal(index.throughEdges[0].targetEntryIndex, 0);
    const payload = await scan(index, 'O', 30);
    assert.equal(payload.remainingMsByStop.get('D')?.[0]?.remainMs, 0);
    assert.equal(lastCount(payload, 'D'), 1);
    assert.equal(payload.reachableStops.includes('TOO_LATE'), false);
    assert.equal(payload.remainingMsByStop.has('TOO_LATE'), false);
    const overlay = buildReachableStopsOverlayGeoJSON({
        payload,
        getStationCoord: (stationId) => ({
            D: [139.7, 35.6],
            TOO_LATE: [139.8, 35.7]
        })[stationId] || null
    });
    assert.equal(overlay.geojson.features.length, 1);
    assert.equal(overlay.geojson.features[0].properties.id, 'D');
    assert.equal(overlay.geojson.features[0].properties.radiusMeters, 250);
    const batchOne = await scan(index, 'O', 30, null, { opportunityBatchSize: 1 });
    const batchTwo = await scan(index, 'O', 30, null, { opportunityBatchSize: 2 });
    const batchSixtyFour = await scan(index, 'O', 30, null, { opportunityBatchSize: 64 });
    assert.deepEqual(batchOne, batchTwo);
    assert.deepEqual(batchTwo, batchSixtyFour);
    assert.deepEqual(payload.meta, {
        metric: 'originDepartureOpportunity',
        requestedMinutes: 30,
        planningBudgetMinutes: 35,
        maxEnvelopeMinutes: 40,
        serviceDay: 'Weekday'
    });
}

{
    const index = buildIndex({
        trips: [makeTrip({
            id: 'X.RepeatedPosition.1.Weekday',
            stops: [
                ['O', 0, 0],
                ['A', 1, 1],
                ['B', 1, 1],
                ['A', 1, 1],
                ['C', 2, 2]
            ]
        })]
    });
    const payload = await scan(index, 'O', 5);
    assert.equal(lastCount(payload, 'C'), 1);
}

{
    const loopTrip = makeTrip({
        id: 'X.WindowLoop.1.Weekday',
        stops: [['O', 0, 0], ['X', 10, 10], ['Y', 20, 20], ['X', 20, 20]]
    });
    const targetTrip = makeTrip({
        id: 'X.WindowTarget.1.Weekday',
        stops: [['X', 45, 45], ['D', 50, 50]]
    });
    const payload = await scan(buildIndex({ trips: [loopTrip, targetTrip] }), 'O', 60);
    assert.equal(lastCount(payload, 'D'), 1, 'an arrival outside the coverage window must be retained');
}

{
    const loopTrip = makeTrip({
        id: 'X.CoveredLoop.1.Weekday',
        stops: [['O', 0, 0], ['X', 10, 10], ['Y', 20, 20], ['X', 20, 20]]
    });
    const targetTrip = makeTrip({
        id: 'X.CoveredTarget.1.Weekday',
        stops: [['X', 30, 30], ['D', 35, 35]]
    });
    const payload = await scan(buildIndex({ trips: [loopTrip, targetTrip] }), 'O', 30);
    assert.equal(lastCount(payload, 'D'), 1, 'a final-window arrival may be safely covered by the earlier arrival');
}

{
    const index = buildIndex({
        trips: [makeTrip({
            id: 'X.LongDwell.1.Weekday',
            stops: [['O', 0, 0], ['X', 1, 32], ['D', 33, 33]]
        })]
    });
    const payload = await scan(index, 'O', 60);
    assert.equal(payload.reachableStops.includes('X'), true);
    assert.equal(payload.reachableStops.includes('D'), false);
}

{
    const rootId = 'X.Root.1.Weekday';
    const fastId = 'X.Fast.1.Weekday';
    const slowId = 'X.Slow.1.Weekday';
    const targetId = 'X.Target.1.Weekday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: rootId, nt: [fastId, slowId], stops: [['O', 0, 0], ['J', 1, 1]] }),
            makeTrip({ id: fastId, pt: [rootId], stops: [['J', 2, 2], ['X', 10, 10]] }),
            makeTrip({ id: slowId, pt: [rootId], stops: [['J', 2, 2], ['X', 20, 20]] }),
            makeTrip({ id: targetId, stops: [['X', 45, 45], ['D', 50, 50]] })
        ]
    });
    const payload = await scan(index, 'O', 60);
    const circlesAtX = payload.remainingMsByStop.get('X');
    assert.equal(circlesAtX.length, 1, 'two paths of one opportunity must produce one circle at X');
    assert.equal(circlesAtX[0].count, 1);
    assert.equal(
        circlesAtX[0].remainMs,
        52 * 60_000,
        'the faster path must retain the maximum bucketed remaining time'
    );
    assert.equal(lastCount(payload, 'D'), 1);
}

{
    const index = buildIndex({
        trips: [
            makeTrip({ id: 'X.One.1.Weekday', stops: [['O', 0, 0], ['D', 10, 10]] }),
            makeTrip({ id: 'X.Two.1.Weekday', stops: [['O', 5, 5], ['D', 15, 15]] })
        ]
    });
    const payload = await scan(index, 'O', 30);
    assert.equal(lastCount(payload, 'D'), 2);
}

{
    const index = buildIndex({
        trips: [
            makeTrip({ id: 'X.MergeOne.1.Weekday', stops: [['O', 0, 0], ['X', 5, 5]] }),
            makeTrip({ id: 'X.MergeTwo.1.Weekday', stops: [['O', 10, 10], ['X', 15, 15]] }),
            makeTrip({ id: 'X.MergeLast.1.Weekday', stops: [['X', 20, 20], ['D', 25, 25]] })
        ]
    });
    const payload = await scan(index, 'O', 30);
    assert.equal(
        lastCount(payload, 'D'),
        2,
        'two independent origin departures boarding one final trip must remain two opportunities'
    );
}

{
    const ntSourceId = 'X.NtOnlySource.1.Weekday';
    const ntTargetId = 'X.NtOnlyTarget.1.Weekday';
    const ntIndex = buildIndex({
        trips: [
            makeTrip({ id: ntSourceId, nt: [ntTargetId], stops: [['O', 0, 0], ['J', 5, 5]] }),
            makeTrip({ id: ntTargetId, stops: [['J', 5, 5], ['D', 10, 10]] })
        ]
    });
    assert.deepEqual(ntIndex.throughEdges.map((edge) => ({
        sourceTripId: edge.sourceTripId,
        targetTripId: edge.targetTripId,
        linkedByNt: edge.linkedByNt,
        linkedByPt: edge.linkedByPt
    })), [{
        sourceTripId: ntSourceId,
        targetTripId: ntTargetId,
        linkedByNt: true,
        linkedByPt: false
    }]);
    assert.equal(ntIndex.componentIdByTripId.get(ntSourceId), ntIndex.componentIdByTripId.get(ntTargetId));
    assert.equal(ntIndex.throughEdgesFromTripId.has(ntTargetId), false, 'through direction must not reverse');

    const ptSourceId = 'X.PtOnlySource.1.Weekday';
    const ptTargetId = 'X.PtOnlyTarget.1.Weekday';
    const ptIndex = buildIndex({
        trips: [
            makeTrip({ id: ptSourceId, stops: [['P', 20, 20], ['Q', 25, 25]] }),
            makeTrip({ id: ptTargetId, pt: [ptSourceId], stops: [['Q', 25, 25], ['R', 30, 30]] })
        ]
    });
    assert.deepEqual(ptIndex.throughEdges.map((edge) => ({
        sourceTripId: edge.sourceTripId,
        targetTripId: edge.targetTripId,
        linkedByNt: edge.linkedByNt,
        linkedByPt: edge.linkedByPt
    })), [{
        sourceTripId: ptSourceId,
        targetTripId: ptTargetId,
        linkedByNt: false,
        linkedByPt: true
    }]);
}

{
    const sourceId = 'X.RejectedAlignmentSource.1.Weekday';
    const targetId = 'X.RejectedAlignmentTarget.1.Weekday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: sourceId, nt: [targetId], stops: [['O', 0, 0], ['J', 5, 5]] }),
            makeTrip({ id: targetId, stops: [['K', 10, 10], ['D', 15, 15]] })
        ],
        transfers: new Map([['K', [{ stopId: 'J', penaltyMin: 0 }]]])
    });
    assert.equal(index.throughEdges.length, 0);
    assert.equal(index.stats.rejectedAlignmentCount, 1);
    const payload = await scan(index, 'O', 30);
    assert.equal(lastCount(payload, 'D'), 1, 'a rejected through edge may still be an ordinary transfer');
}

{
    const sourceId = 'X.BackwardSource.1.Weekday';
    const targetId = 'X.BackwardTarget.1.Weekday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: sourceId, nt: [targetId], stops: [['O', 20, 20], ['J', 30, 30]] }),
            makeTrip({ id: targetId, stops: [['J', 25, 25], ['D', 35, 35]] })
        ]
    });
    assert.equal(index.throughEdges.length, 0);
    assert.equal(index.stats.rejectedAlignmentCount, 1, 'backward time must fail closed');
}

{
    const sourceId = 'X.MissingTargetDepartureSource.1.Weekday';
    const targetId = 'X.MissingTargetDepartureTarget.1.Weekday';
    const targetTrip = makeTrip({
        id: targetId,
        pt: [sourceId],
        stops: [['J', 5, 5], ['D', 10, 10]]
    });
    targetTrip.stops[0].hasDeparture = false;
    const index = buildIndex({
        trips: [
            makeTrip({ id: sourceId, nt: [targetId], stops: [['O', 0, 0], ['J', 5, 5]] }),
            targetTrip
        ]
    });
    assert.equal(index.throughEdges.length, 0);
    assert.equal(index.stats.rejectedAlignmentCount, 1);
    assert.notEqual(index.componentIdByTripId.get(sourceId), index.componentIdByTripId.get(targetId));
}

{
    const sourceId = 'X.MissingOverlapArrivalSource.1.Weekday';
    const targetId = 'X.MissingOverlapArrivalTarget.1.Weekday';
    const targetTrip = makeTrip({
        id: targetId,
        pt: [sourceId],
        stops: [['J', 5, 5], ['K', 10, 10], ['D', 15, 15]]
    });
    targetTrip.stops[1].hasArrival = false;
    const index = buildIndex({
        trips: [
            makeTrip({ id: sourceId, nt: [targetId], stops: [['O', 0, 0], ['J', 5, 5], ['K', 10, 10]] }),
            targetTrip
        ]
    });
    assert.equal(index.throughEdges.length, 0);
    assert.equal(index.stats.rejectedAlignmentCount, 1);
}

{
    const weekdayId = 'X.CrossDaySource.1.Weekday';
    const saturdayId = 'X.CrossDayTarget.1.SaturdayHoliday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: weekdayId, nt: [saturdayId], stops: [['O', 0, 0], ['J', 5, 5]] }),
            makeTrip({ id: saturdayId, pt: [weekdayId], stops: [['J', 5, 5], ['D', 10, 10]] })
        ]
    });
    assert.equal(index.tripById.has(saturdayId), false);
    assert.equal(index.throughEdges.length, 0);
    assert.equal(index.stats.missingReferenceCount, 1, 'cross-service-day refs must fail closed');
}

{
    const rootId = 'X.MinWalkRoot.1.Weekday';
    const targetId = 'X.MinWalkTarget.1.Weekday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: rootId, nt: [targetId], stops: [['PLATFORM_A', 0, 0], ['JOIN_A', 0, 0]] }),
            makeTrip({ id: targetId, pt: [rootId], stops: [['PLATFORM_B', 0, 0], ['D', 33, 33]] })
        ],
        groups: [['JOIN_A', 'PLATFORM_B']]
    });
    const slowerPayload = await scan(index, 'ORIGIN', 30, [
        { stopId: 'PLATFORM_A', walkMinutes: 5 },
        { stopId: 'PLATFORM_B', walkMinutes: 5 }
    ]);
    assert.equal(lastCount(slowerPayload, 'D'), 0);
    const minimumPayload = await scan(index, 'ORIGIN', 30, [
        { stopId: 'PLATFORM_A', walkMinutes: 5 },
        { stopId: 'PLATFORM_B', walkMinutes: 1 }
    ]);
    assert.equal(
        lastCount(minimumPayload, 'D'),
        1,
        'duplicate representations of one opportunity must use the minimum origin walk penalty'
    );
}

{
    const aId = 'X.CycleA.1.Weekday';
    const bId = 'X.CycleB.1.Weekday';
    const index = buildIndex({
        trips: [
            makeTrip({ id: aId, nt: [bId], pt: [bId], stops: [['Y', 0, 0], ['X', 0, 0]] }),
            makeTrip({ id: bId, nt: [aId], pt: [aId], stops: [['X', 0, 0], ['Y', 0, 0]] })
        ]
    });
    assert.equal(index.throughEdges.length, 0);
    assert.equal(index.stats.rejectedCycleEdgeCount, 2);
}

const [chiba1, chiba2, chuo, fujikyu, disney, joban, jobanRapid, yokosuka, sobuRapid] = await Promise.all([
    readTrips('chibamonorail-line1.json'),
    readTrips('chibamonorail-line2.json'),
    readTrips('jreast-chuo.json'),
    readTrips('fujikyu-fujikyu.json'),
    readTrips('disney-disneyresortline.json'),
    readTrips('jreast-joban.json'),
    readTrips('jreast-jobanrapid.json'),
    readTrips('jreast-yokosuka.json'),
    readTrips('jreast-soburapid.json')
]);

const byId = (rows, id) => rows.find((trip) => trip.id === id);

{
    const aId = 'ChibaMonorail.Line1.5011.Weekday';
    const bId = 'ChibaMonorail.Line2.5011.Weekday';
    const index = buildIndex({
        trips: [byId(chiba1, aId), byId(chiba2, bId)],
        groups: [[
            'ChibaMonorail.Line1.Chiba',
            'ChibaMonorail.Line2.Chiba'
        ]]
    });
    assert.deepEqual(
        index.throughEdges.map((edge) => [edge.sourceTripId, edge.targetTripId, edge.targetEntryIndex]),
        [[aId, bId, 0]]
    );
    const payload = await scan(index, 'ChibaMonorail.Line1.ChibaMinato', 30);
    assert.equal(lastCount(payload, 'ChibaMonorail.Line2.Chishirodai'), 1);
}

{
    const rootId = 'JR-East.Chuo.5003M.Weekday.1';
    const branchAId = 'JR-East.Chuo.5003M.Weekday.2';
    const branchBId = 'Fujikyu.Fujikyu.2103M.Weekday';
    const index = buildIndex({
        trips: [byId(chuo, rootId), byId(chuo, branchAId), byId(fujikyu, branchBId)],
        groups: [['JR-East.Chuo.Otsuki', 'Fujikyu.Fujikyu.Otsuki']]
    });
    assert.deepEqual(
        (index.throughEdgesFromTripId.get(rootId) || []).map((edge) => edge.targetTripId).sort(),
        [branchBId, branchAId].sort()
    );
}

{
    const weekdayDisney = disney.filter((trip) => isTripInStrictServiceDay(trip.id, 'Weekday'));
    const index = buildIndex({ trips: weekdayDisney });
    const seen = new Set();
    let current = 'Disney.DisneyResortLine.0603.Weekday';
    while (current && !seen.has(current)) {
        seen.add(current);
        const edges = index.throughEdgesFromTripId.get(current) || [];
        current = edges[0]?.targetTripId || '';
    }
    assert.equal(seen.size, 81);
    assert.equal(current, '');
}

{
    const aId = 'JR-East.Joban.52M.Weekday';
    const bId = 'JR-East.JobanRapid.52M.Weekday';
    const groups = [
        ['JR-East.Joban.Kashiwa', 'JR-East.JobanRapid.Kashiwa'],
        ['JR-East.Joban.Nippori', 'JR-East.JobanRapid.Nippori']
    ];
    const index = buildIndex({ trips: [byId(joban, aId), byId(jobanRapid, bId)], groups });
    assert.equal(index.throughEdges.length, 1);
    assert.equal(index.throughEdges[0].targetEntryIndex, 1);
    const payload = await scan(index, 'JR-East.Joban.Kashiwa', 90, [
        { stopId: 'JR-East.Joban.Kashiwa', walkMinutes: 0 },
        { stopId: 'JR-East.JobanRapid.Kashiwa', walkMinutes: 0 }
    ]);
    assert.equal(lastCount(payload, 'JR-East.JobanRapid.Nippori'), 1);
    assert.equal(lastCount(payload, 'JR-East.JobanRapid.Ueno'), 1);
}

{
    const aId = 'JR-East.Yokosuka.2220S.Weekday';
    const bId = 'JR-East.SobuRapid.2221F.Weekday';
    const index = buildIndex({
        trips: [byId(yokosuka, aId), byId(sobuRapid, bId)],
        groups: [['JR-East.Yokosuka.Tokyo', 'JR-East.SobuRapid.Tokyo']]
    });
    assert.deepEqual(
        index.throughEdges.map((edge) => [edge.sourceTripId, edge.targetTripId, edge.targetEntryIndex]),
        [[aId, bId, 0]]
    );
}

console.log('reachable stops opportunity smoke ok');

import assert from 'node:assert/strict';

import { buildReachableStopsTimetableIndex } from '../src/domain/reachableStops/timetableIndex.js';
import { scanReachableStopsByDepartureOpportunity } from '../src/domain/reachableStops/opportunityPlanner.js';
import { createTerminalTransferIndex } from '../src/domain/reachableStops/terminalTransferIndex.js';
import { createTransferHistoryIndex } from '../src/domain/reachableStops/transferHistoryIndex.js';
import './compactArrivalStore.smoke.mjs';
import './reachableStopsQueryIndex.smoke.mjs';
import './reachableStopsWorkerTimetableIndex.smoke.mjs';
import './reachableStopsOpportunityParallel.smoke.mjs';

const tripId = (name) => `Optimization.${name}.Weekday`;
const makeTrip = (name, stops, next = []) => ({
    tripId: tripId(name),
    rawTripId: tripId(name),
    ntRefs: next.map(tripId),
    stops: stops.map(([stopId, arrMin, depMin = arrMin]) => ({ stopId, arrMin, depMin }))
});

const buildIndex = ({ trips, groups = [], transfers = new Map() }) => {
    const groupByStop = new Map();
    for (const members of groups) {
        const group = new Set(members);
        for (const stopId of members) groupByStop.set(stopId, group);
    }
    return buildReachableStopsTimetableIndex({
        serviceDay: 'Weekday',
        trips,
        groupByStop,
        transferSourcesByTargetStop: transfers
    });
};

const compareModes = async (name, fixture, minutes = 60) => {
    const index = buildIndex(fixture);
    const options = {
        index,
        originStationId: 'O',
        minutes,
        yieldControl: async () => {},
        yieldEveryConnections: Number.MAX_SAFE_INTEGER
    };
    const reference = await scanReachableStopsByDepartureOpportunity({
        ...options,
        optimizeTransferChecks: false,
        groupEquivalentStates: false
    });
    const previousOptimized = await scanReachableStopsByDepartureOpportunity({
        ...options,
        optimizeTransferChecks: true,
        groupEquivalentStates: false
    });
    const optimized = await scanReachableStopsByDepartureOpportunity({
        ...options,
        optimizeTransferChecks: true,
        groupEquivalentStates: true
    });
    assert.deepEqual(previousOptimized, reference, `${name}: previous optimized and reference scans must be identical`);
    assert.deepEqual(optimized, reference, `${name}: optimized and reference scans must be identical`);
    return optimized;
};

const countAt = (result, stopId) => result.remainingMsByStop.get(stopId)?.at(-1)?.count || 0;
const twoBoardingPrefix = () => [
    makeTrip('Origin', [['O', 0], ['A', 1]]),
    makeTrip('FirstTransfer', [['A', 2], ['B', 3]])
];

// Equivalent histories may share rides, but their independent departure
// opportunities must both survive every through branch and ordinary transfer.
{
    const result = await compareModes('shared histories retain both opportunities through branches', {
        trips: [
            makeTrip('SharedOriginA', [['O', 0], ['A', 1]]),
            makeTrip('SharedOriginB', [['O', 0], ['A', 1]]),
            makeTrip('SharedFirstTransfer', [['A', 2], ['B', 3]]),
            makeTrip('SharedSecondTransfer', [['B', 4], ['J', 5]], ['SharedLeft', 'SharedRight']),
            makeTrip('SharedLeft', [['J', 5], ['LEFT', 6]]),
            makeTrip('SharedRight', [['J', 5], ['RIGHT', 6]]),
            makeTrip('SharedLeftFinal', [['LEFT', 7], ['LEFT-END', 8]]),
            makeTrip('SharedRightFinal', [['RIGHT', 7], ['RIGHT-END', 8]])
        ]
    }, 30);
    for (const stopId of ['B', 'J', 'LEFT', 'RIGHT', 'LEFT-END', 'RIGHT-END']) {
        assert.equal(countAt(result, stopId), 2, `${stopId}: sharing a ride must not merge departure opportunities`);
    }
}

{
    const result = await compareModes('shared ride keeps each opportunity deadline', {
        trips: [
            makeTrip('EarlyDeadline', [['O', 0], ['A', 1]]),
            makeTrip('LateDeadline', [['O', 10], ['A', 11]]),
            makeTrip('DeadlineShared', [['A', 12], ['J', 20]], [
                'Deadline35', 'Deadline36', 'Deadline45', 'Deadline46'
            ]),
            ...[35, 36, 45, 46].map((minute) => makeTrip(
                `Deadline${minute}`, [['J', 20], [`END-${minute}`, minute]]
            ))
        ]
    }, 30);
    assert.equal(countAt(result, 'J'), 2);
    assert.equal(countAt(result, 'END-35'), 2, 'the earlier deadline itself remains reachable');
    assert.equal(countAt(result, 'END-36'), 1, 'only the later opportunity remains after minute 35');
    assert.equal(countAt(result, 'END-45'), 1, 'the later deadline itself remains reachable');
    assert.equal(countAt(result, 'END-46'), 0);
    assert.deepEqual(result.remainingMsByStop.get('J').map(({ remainMs, count }) => ({ remainMs, count })), [
        { remainMs: 1_400_000, count: 1 },
        { remainMs: 840_000, count: 2 }
    ]);
}

// One batch spans two 32-bit words. Deadlines 65..99 progressively remove
// opportunities around bits 31/32/33 without dropping the remaining word.
{
    const arrivalMinutes = [65, 66, 96, 97, 98, 99, 100];
    const result = await compareModes('35 shared round-2 opportunities retain cross-word deadlines', {
        trips: [
            ...Array.from({ length: 35 }, (_, departureMinute) => makeTrip(
                `WordOrigin${departureMinute}`, [['O', departureMinute], ['A', 35]]
            )),
            makeTrip('WordFirstTransfer', [['A', 36], ['B', 37]]),
            makeTrip('WordSecondTransfer', [['B', 38], ['J', 39]], arrivalMinutes.map((minute) => `WordThrough${minute}`)),
            ...arrivalMinutes.map((minute) => makeTrip(
                `WordThrough${minute}`, [['J', 39], [`WORD-END-${minute}`, minute]]
            ))
        ]
    });
    assert.equal(countAt(result, 'J'), 35);
    for (const [minute, expectedCount] of [[65, 35], [66, 34], [96, 4], [97, 3], [98, 2], [99, 1], [100, 0]]) {
        assert.equal(countAt(result, `WORD-END-${minute}`), expectedCount, `minute ${minute}: each cross-word opportunity keeps its own deadline`);
    }
}

// The lower-round history has visited V, while the round-2 history has not.
// Neither can replace the other: one permits another transfer, the other V.
for (const lowerFirst of [true, false]) {
    const result = await compareModes(`mixed arrival rounds with ${lowerFirst ? 'lower' : 'round-2'} inserted first`, {
        trips: [
            makeTrip('MixedOrigin', [['O', 0], ['A', 1]]),
            makeTrip('MixedLower', [['A', 2], ['V-old', 3, lowerFirst ? 4 : 8], ['X', 10]]),
            makeTrip('MixedFirst', [['A', 2], ['B', 3]]),
            makeTrip('MixedSecond', [['B', lowerFirst ? 8 : 4], ['X', 10]]),
            makeTrip('MixedVisitV', [['X', 11], ['V-target', 12], ['ROUND-2-END', 13]]),
            makeTrip('MixedContinue', [['X', 11], ['Y', 12]]),
            makeTrip('MixedLastTransfer', [['Y', 13], ['LOWER-END', 14]])
        ],
        groups: [['V-old', 'V-target']]
    }, 30);
    assert.equal(countAt(result, 'X'), 1);
    assert.equal(countAt(result, 'ROUND-2-END'), 1, 'the round-2 arrival retains permission to visit V');
    assert.equal(countAt(result, 'LOWER-END'), 1, 'the lower-round arrival retains one more transfer');
}

for (const through of [false, true]) {
    const result = await compareModes(`shared ${through ? 'through' : 'same-trip'} ride rejects 35-minute dwell`, {
        trips: [
            makeTrip('DwellOriginA', [['O', 0], ['A', 1]]),
            makeTrip('DwellOriginB', [['O', 0], ['A', 1]]),
            ...(through ? [
                makeTrip('DwellShared', [['A', 2], ['WAIT', 10]], ['DwellThrough']),
                makeTrip('DwellThrough', [['WAIT', 45], ['ILLEGAL-END', 46]])
            ] : [
                makeTrip('DwellShared', [['A', 2], ['WAIT', 10, 45], ['ILLEGAL-END', 46]])
            ])
        ]
    });
    assert.equal(countAt(result, 'WAIT'), 2);
    assert.equal(countAt(result, 'ILLEGAL-END'), 0, 'departure-time normalization must not bypass dwell legality');
}

// A 35-minute dwell blocks staying onboard. With a five-minute same-stop
// transfer penalty, its arrival is nevertheless exactly inside the wait window.
// The first terminal-transfer candidate is forbidden; a later one must be tried.
const forbiddenFixture = (legalArrival = null) => ({
    trips: [
        ...twoBoardingPrefix(),
        makeTrip('ForbiddenTarget', [['B', 4], ['X', 10, 45], ['D', 46]]),
        ...(legalArrival == null ? [] : [
            makeTrip('LegalArrival', [['B', 4], ['X', legalArrival]])
        ])
    ],
    transfers: new Map([['X', [{ stopId: 'X', penaltyMin: 5 }]]])
});

{
    const blocked = await compareModes('only forbidden terminal arrival', forbiddenFixture());
    assert.equal(countAt(blocked, 'D'), 0);
    const laterLegal = await compareModes('skip forbidden then accept later arrival', forbiddenFixture(12));
    assert.equal(countAt(laterLegal, 'D'), 1);
    const unrestricted = await compareModes('same-time forbidden union becomes null', forbiddenFixture(10));
    assert.equal(countAt(unrestricted, 'D'), 1, 'the replacement active arrival with forbiddenTripId=null must remain indexed');
}

// V-old and V-target share a physical group, but deliberately have no walking
// transfer edge. Thus the earlier visit cannot board the final trip at V-target.
const visitedFixture = (includeLegal) => ({
    trips: [
        ...twoBoardingPrefix(),
        makeTrip('VisitedFirst', [['B', 4], ['V-old', 6], ['X', 10]]),
        ...(includeLegal ? [makeTrip('UnvisitedLater', [['B', 4], ['X', 12]])] : []),
        makeTrip('FinalAfterVisited', [['X', 15], ['V-target', 16], ['END', 17]])
    ],
    groups: [['V-old', 'V-target']]
});

{
    const blocked = await compareModes('only visited-target terminal arrival', visitedFixture(false));
    assert.equal(countAt(blocked, 'END'), 0);
    const legal = await compareModes('skip visited-target then accept later arrival', visitedFixture(true));
    assert.equal(countAt(legal, 'END'), 1);
}

// For departure 45 and walking penalty 5, valid arrivals are exactly [10, 40].
for (const [arrivalMinute, expectedCount] of [[9, 0], [10, 1], [40, 1], [41, 0]]) {
    const result = await compareModes(`terminal window boundary at ${arrivalMinute}`, {
        trips: [
            ...twoBoardingPrefix(),
            makeTrip('SecondTransferToWalk', [['B', 4], ['S', arrivalMinute]]),
            makeTrip('AfterWalk', [['X', 45], ['D', 46]])
        ],
        transfers: new Map([['X', [{ stopId: 'S', penaltyMin: 5 }]]])
    });
    assert.equal(countAt(result, 'D'), expectedCount);
}

// Finding a terminal boarding in the first walking source must not suppress
// a lower-round boarding of the same opportunity in another source.
{
    const result = await compareModes('terminal bit does not skip lower-round sources', {
        trips: [
            makeTrip('SourceOrigin', [['O', 0], ['A', 1]]),
            makeTrip('SourceLowerRound', [['A', 2], ['S-low', 10]]),
            makeTrip('SourceFirstTransfer', [['A', 2], ['B', 3]]),
            makeTrip('SourceSecondTransfer', [['B', 4], ['S-high', 10]]),
            makeTrip('SharedBoarding', [['X', 15], ['Y', 16]]),
            makeTrip('StillAllowedThirdTransfer', [['Y', 17], ['Z', 18]])
        ],
        transfers: new Map([['X', [
            { stopId: 'S-high', penaltyMin: 0 },
            { stopId: 'S-low', penaltyMin: 1 }
        ]]])
    });
    assert.equal(countAt(result, 'Z'), 1, 'only the lower-round route has one ordinary transfer left at Y');
}

// Two incomparable round-2 histories enter a shared through trip with different
// last-arrival times. Its common arrival merges them, deactivating the old row.
// The active replacement must be queried, and the slower branch must not lower
// the best remaining-time bucket or count the opportunity a second time.
const mergedHistoryFixture = (duplicates = false) => ({
    trips: [
        makeTrip('MergeOrigin', [['O', 0], ['A', 1]]),
        makeTrip('MergeBadHistory', [['A', 2], ['V-old', 3], ['B-bad', 5]]),
        makeTrip('MergeGoodHistory', [['A', 2], ['B-good', 6]]),
        ...(duplicates ? [makeTrip('MergeGoodDuplicate', [['A', 2], ['B-good', 6]])] : []),
        makeTrip('MergeSecondBad', [['B-bad', 7], ['J', 10]], ['MergeFast', 'MergeSlow']),
        makeTrip('MergeSecondGood', [['B-good', 8], ['J', 11]], ['MergeFast', 'MergeSlow']),
        makeTrip('MergeFast', [['J', 12], ['X', 13]]),
        makeTrip('MergeSlow', [['J', 12], ['X', 17]]),
        makeTrip('MergeFinal', [['X', 18], ['V-target', 19], ['END', 20]])
    ],
    groups: [['V-old', 'V-target']]
});

{
    const result = await compareModes('active replacement after round-2 history merge', mergedHistoryFixture(), 30);
    const duplicate = await compareModes('duplicate history does not add opportunity', mergedHistoryFixture(true), 30);
    assert.deepEqual(duplicate, result);
    assert.equal(countAt(result, 'X'), 1);
    assert.equal(countAt(result, 'END'), 1);
    assert.deepEqual(result.remainingMsByStop.get('X').map(({ remainMs, count }) => ({ remainMs, count })), [
        { remainMs: 21 * 60_000, count: 1 }
    ]);
    assert.equal(result.remainingMsByStop.get('END')[0].remainMs, 14 * 60_000);
}

{
    const result = await compareModes('third ordinary transfer keeps all following through rides', {
        trips: [
            ...twoBoardingPrefix(),
            makeTrip('LimitSecond', [['B', 4], ['C', 5]]),
            makeTrip('LimitThird', [['C', 6], ['D', 7]], ['LimitThroughA']),
            makeTrip('LimitThroughA', [['D', 7], ['E', 8]], ['LimitThroughB', 'LimitThroughBranch']),
            makeTrip('LimitThroughB', [['E', 8], ['F', 9]]),
            makeTrip('LimitThroughBranch', [['E', 8], ['BRANCH', 9]]),
            makeTrip('LimitFourth', [['F', 10], ['TOO-MANY', 11]])
        ]
    }, 30);
    for (const stopId of ['D', 'E', 'F', 'BRANCH']) assert.equal(countAt(result, stopId), 1);
    assert.equal(countAt(result, 'TOO-MANY'), 0);
}

// The deadline is 35, so an arrival is in the same-time-only frontier before
// minute 5 and in the cross-time frontier from minute 5 onward. The first X3
// arrival cannot replace X4: its 30-minute window ends before departure 34.
// X4 also cannot replace X5/X6, which can still board at the deadline itself.
for (const arrivalMinute of [4, 5, 6]) {
    const result = await compareModes(`arrival frontier cutoff at ${arrivalMinute}`, {
        trips: [
            ...twoBoardingPrefix(),
            makeTrip('CutoffSecond', [['B', 3], ['X', 3], ['X', arrivalMinute]]),
            makeTrip('CutoffBeforeDeadline', [['X', 34], ['EARLY-END', 34]]),
            makeTrip('CutoffAtDeadline', [['X', 35], ['DEADLINE-END', 35]]),
            makeTrip('CutoffAfterDeadline', [['X', 36], ['LATE-END', 36]])
        ]
    }, 30);
    assert.equal(countAt(result, 'EARLY-END'), 1, 'distinct early arrival times retain their own wait windows');
    assert.equal(countAt(result, 'DEADLINE-END'), arrivalMinute >= 5 ? 1 : 0);
    assert.equal(countAt(result, 'LATE-END'), 0);
    assert.equal(result.remainingMsByStop.get('EARLY-END')[0].remainMs, 0);
    if (arrivalMinute >= 5) assert.equal(result.remainingMsByStop.get('DEADLINE-END')[0].remainMs, 0);
}

// Preserve the current same-trip/same-time arrival merge before following a
// through edge. The earlier X5 history excludes V; the terminal X5 arrival
// gains that merged history, which its through continuation must also receive.
{
    const result = await compareModes('arrival history merge remains visible to through continuation', {
        trips: [
            ...twoBoardingPrefix(),
            makeTrip('SameTimeSource', [['B', 4], ['X', 5], ['V-old', 5], ['X', 5]], ['SameTimeThrough']),
            makeTrip('SameTimeThrough', [['X', 5], ['Y', 6]]),
            makeTrip('SameTimeFinal', [['Y', 7], ['V-target', 8], ['END', 9]])
        ],
        groups: [['V-old', 'V-target']]
    }, 30);
    assert.equal(countAt(result, 'END'), 1);
    assert.equal(result.remainingMsByStop.get('END')[0].remainMs, 1_540_000);
}

const indexedArrival = (overrides = {}) => ({
    opportunityNumber: 0,
    deadlineMin: 50,
    transferCount: 2,
    arrMin: 10,
    forbiddenTripId: 'previous-trip',
    visitedGroups: 1n,
    active: true,
    ...overrides
});
const indexWindow = (departureMinute, walkingPenalty = 0) => ({
    stopId: 'S',
    connection: {
        tripId: 'next-trip',
        fromStopId: 'S',
        fromGroupKey: 'S',
        toGroupKey: 'T',
        depMin: departureMinute,
        arrMin: departureMinute
    },
    minArrivalMinute: departureMinute - walkingPenalty - 30,
    maxArrivalMinute: departureMinute - walkingPenalty
});

{
    let historyChecks = 0;
    const index = createTerminalTransferIndex({
        getOpportunityBit: (number) => 1n << BigInt(number),
        hasVisitedGroup: () => { historyChecks += 1; return false; }
    });
    for (const arrMin of [10, 12, 11]) index.add('S', indexedArrival({ arrMin }));
    assert.equal(index.findBoardableBits(indexWindow(15)), 1n);
    assert.equal(historyChecks, 1, 'one legal terminal witness skips all remaining arrivals of the opportunity');
    assert.equal(index.findBoardableBits({ ...indexWindow(15), alreadyBoardedBits: 1n }), 1n);
    assert.equal(historyChecks, 1, 'an already boarded opportunity performs no history checks');
}

{
    let historyChecks = 0;
    const index = createTransferHistoryIndex({
        hasVisitedGroup: () => { historyChecks += 1; return false; }
    });
    for (const arrMin of [10, 12, 11]) index.add('S', indexedArrival({ arrMin, transferCount: 1 }));
    const visits = [];
    const visit = (state, fromGroupKey) => visits.push([state.arrMin, fromGroupKey]);
    index.forEachBoardable({ ...indexWindow(15), visit });
    assert.deepEqual(visits, [[10, 'S']], 'identical history needs only its first legal arrival witness');
    assert.equal(historyChecks, 1);
    let skipChecks = 0;
    index.forEachBoardable({
        ...indexWindow(15),
        canSkipHistory: (opportunityNumber, history) => {
            skipChecks += 1;
            assert.equal(opportunityNumber, 0);
            assert.equal(history, 1n);
            return true;
        },
        visit
    });
    assert.equal(skipChecks, 1);
    assert.equal(visits.length, 1, 'a dominated history does not visit another candidate');
    assert.equal(historyChecks, 1, 'canSkipHistory short-circuits before the history membership check');
}

const arrivalIndexCases = [
    {
        name: 'terminal',
        transferCount: 2,
        inactiveArrivalMinute: 11,
        create: (options) => createTerminalTransferIndex({
            getOpportunityBit: (number) => 1n << BigInt(number),
            ...options
        }),
        query: (index, window) => index.findBoardableBits(window) === 1n
    },
    {
        name: 'history',
        transferCount: 1,
        inactiveArrivalMinute: 9,
        create: createTransferHistoryIndex,
        query: (index, window) => {
            let visits = 0;
            index.forEachBoardable({ ...window, visit: () => { visits += 1; } });
            assert.ok(visits <= 1, 'one opportunity with one history has at most one witness');
            return visits === 1;
        }
    }
];

for (const testCase of arrivalIndexCases) {
    const expired = [];
    const index = testCase.create({
        hasVisitedGroup: () => false,
        onExpire: (stopId, opportunityNumber) => expired.push([stopId, opportunityNumber])
    });
    let inactive = false;
    let activeReads = 0;
    const retiring = indexedArrival({
        transferCount: testCase.transferCount,
        deadlineMin: 15,
        arrMin: testCase.inactiveArrivalMinute
    });
    Object.defineProperty(retiring, 'active', {
        get: () => { activeReads += 1; return !inactive; }
    });
    index.add('S', retiring);
    index.add('S', indexedArrival({ transferCount: testCase.transferCount, deadlineMin: 15 }));
    assert.equal(testCase.query(index, indexWindow(10)), true);
    inactive = true;
    assert.equal(testCase.query(index, indexWindow(14)), true, `${testCase.name}: inactive candidates do not hide the active witness`);
    assert.equal(testCase.query(index, indexWindow(15)), true, `${testCase.name}: five-minute cleanup preserves an equal-deadline witness`);
    const readsAfterCleanup = activeReads;
    assert.equal(testCase.query(index, indexWindow(15)), true);
    assert.equal(activeReads, readsAfterCleanup, `${testCase.name}: the inactive row was removed, not repeatedly scanned`);
    assert.deepEqual(expired, [], `${testCase.name}: the deadline itself is inclusive`);
    assert.equal(testCase.query(index, indexWindow(16)), false);
    assert.deepEqual(expired, [['S', 0]], `${testCase.name}: expiry is reported only after the deadline`);

    const windowIndex = testCase.create({ hasVisitedGroup: () => false });
    windowIndex.add('S', indexedArrival({ transferCount: testCase.transferCount, arrMin: 5, deadlineMin: 40 }));
    assert.equal(testCase.query(windowIndex, indexWindow(40)), false, `${testCase.name}: arrival before the current window does not board`);
    assert.equal(testCase.query(windowIndex, indexWindow(40, 5)), true, `${testCase.name}: a later walking-source window may still match the same arrival`);
}

console.log('reachable stops opportunity optimization smoke ok');

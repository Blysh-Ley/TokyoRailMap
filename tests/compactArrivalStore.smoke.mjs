import assert from 'node:assert/strict';
import { createCompactArrivalStore } from '../src/domain/reachableStops/compactArrivalStore.js';
import { createTerminalTransferIndex } from '../src/domain/reachableStops/terminalTransferIndex.js';
import { createTransferHistoryIndex } from '../src/domain/reachableStops/transferHistoryIndex.js';

const opportunities = [null, null, { deadlineMin: 35 }, { deadlineMin: 65 }, { deadlineMin: 90 }, { deadlineMin: 120 }];
const groupBits = { A: 1n, B: 2n, C: 4n, D: 8n };
const isSubset = (a, b) => (a & b) === a;
const hasVisitedGroup = (history, group) => (history & (groupBits[group] || 0n)) !== 0n;
const getOpportunityBit = (number) => 1n << BigInt(number - 2);
const options = { opportunities, batchStart: 2, maxWaitMinutes: 30, maxTransferCount: 3, isSubset, hasVisitedGroup, getOpportunityBit };

// Object-based reference: preserve the former optimized addArrivalLabel order,
// including mutation of an arrival rejected before it reaches a query index.
const createObjectReference = () => {
    const frontiers = new Map();
    const roundZero = new Map();
    const lastPrune = new Map();
    const onExpire = (stopId, number) => frontiers.get(stopId)?.delete(number);
    const terminal = createTerminalTransferIndex({ getOpportunityBit, hasVisitedGroup, onExpire });
    const history = createTransferHistoryIndex({ hasVisitedGroup, onExpire });
    const insert = (rows, label) => {
        let position = 0;
        while (position < rows.length && rows[position].arrMin <= label.arrMin) position += 1;
        rows.splice(position, 0, label);
    };
    const dominates = (a, b) => a.active && (a.forbiddenTripId == null || a.forbiddenTripId === b.forbiddenTripId) &&
        a.arrMin <= b.arrMin && (a.arrMin === b.arrMin || a.arrMin + 30 >= a.deadlineMin) &&
        a.transferCount <= b.transferCount && isSubset(a.visitedGroups, b.visitedGroups);

    const add = (stopId, opportunityNumber, transferCount, arrMin, forbiddenTripId, visitedGroups) => {
        const label = { opportunityNumber, transferCount, arrMin, forbiddenTripId, visitedGroups, active: true, deadlineMin: opportunities[opportunityNumber].deadlineMin };
        const accept = () => {
            if (!frontiers.has(stopId)) frontiers.set(stopId, new Map());
            const frontier = frontiers.get(stopId);
            if (!frontier.has(opportunityNumber)) frontier.set(opportunityNumber, { earlyByArrival: null, lateRows: null });
            const partitions = frontier.get(opportunityNumber);
            let rows;
            if (arrMin + 30 < label.deadlineMin) {
                const early = partitions.earlyByArrival ??= new Map();
                if (!early.has(arrMin)) early.set(arrMin, []);
                rows = early.get(arrMin);
            } else rows = partitions.lateRows ??= [];
            if (transferCount === 2) {
                for (let position = rows.length - 1; position >= 0; position -= 1) {
                    const existing = rows[position];
                    if (!existing.active || existing.transferCount !== transferCount || existing.arrMin !== arrMin || existing.forbiddenTripId !== label.forbiddenTripId) continue;
                    label.visitedGroups &= existing.visitedGroups;
                    if (existing.forbiddenTripId != null && label.visitedGroups === existing.visitedGroups) return;
                    existing.active = false;
                    rows.splice(position, 1);
                }
            }
            for (let position = rows.length - 1; position >= 0; position -= 1) {
                const existing = rows[position];
                if (!existing.active || existing.arrMin !== arrMin || existing.transferCount !== transferCount || existing.visitedGroups !== label.visitedGroups) continue;
                if (existing.forbiddenTripId == null) return;
                if (label.forbiddenTripId == null) {
                    existing.active = false;
                    rows.splice(position, 1);
                    continue;
                }
                if (existing.forbiddenTripId === label.forbiddenTripId) return;
                label.forbiddenTripId = null;
                existing.active = false;
                rows.splice(position, 1);
            }
            for (const existing of rows) if (dominates(existing, label)) return;
            for (let position = rows.length - 1; position >= 0; position -= 1) {
                if (dominates(label, rows[position])) {
                    rows[position].active = false;
                    rows.splice(position, 1);
                }
            }
            rows.push(label);
            if (transferCount === 1) history.add(stopId, label);
            else if (transferCount === 2) terminal.add(stopId, label);
            else {
                if (!roundZero.has(stopId)) roundZero.set(stopId, []);
                insert(roundZero.get(stopId), label);
            }
        };
        accept();
        return label.visitedGroups;
    };
    const forEachBoardable = (query) => {
        history.forEachBoardable({ ...query, visit: (label, fromGroup) => query.visit(label.opportunityNumber, label.transferCount, label.visitedGroups, fromGroup) });
        const { stopId, connection, minArrivalMinute, maxArrivalMinute, visit } = query;
        if (!roundZero.has(stopId)) return;
        if (!lastPrune.has(stopId) || connection.depMin - lastPrune.get(stopId) >= 5) {
            lastPrune.set(stopId, connection.depMin);
            roundZero.set(stopId, roundZero.get(stopId).filter((label) => {
                if (label.active && label.deadlineMin >= connection.depMin) return true;
                if (label.active) {
                    label.active = false;
                    onExpire(stopId, label.opportunityNumber);
                }
                return false;
            }));
        }
        for (const label of roundZero.get(stopId)) {
            if (label.arrMin < minArrivalMinute || label.arrMin > maxArrivalMinute || !label.active || label.deadlineMin < connection.arrMin) continue;
            if (stopId === connection.fromStopId && label.forbiddenTripId === connection.tripId) continue;
            if (connection.toGroupKey !== connection.fromGroupKey && hasVisitedGroup(label.visitedGroups, connection.toGroupKey)) continue;
            visit(label.opportunityNumber, label.transferCount, label.visitedGroups, connection.fromGroupKey);
        }
    };
    return { add, forEachBoardable, findTerminalBoardableBits: terminal.findBoardableBits };
};

const createPair = () => [createObjectReference(), createCompactArrivalStore(options)];
const addToBoth = (pair, ...args) => {
    const expected = pair[0].add(...args);
    assert.equal(pair[1].add(...args), expected, 'accepted and rejected additions return the same merged history');
    return expected;
};
const queryWindow = (depMin, penalty = 0, overrides = {}) => ({
    stopId: 'S',
    connection: { depMin, arrMin: depMin, tripId: 'T', fromStopId: 'S', fromGroupKey: 'A', toGroupKey: 'D' },
    minArrivalMinute: depMin - penalty - 30,
    maxArrivalMinute: depMin - penalty,
    ...overrides
});
const collect = (store, queries) => {
    let bits = 0n;
    const visits = [];
    const candidates = new Map();
    for (const query of queries) {
        bits = store.findTerminalBoardableBits({ ...query, alreadyBoardedBits: bits });
        store.forEachBoardable({
            ...query,
            canSkipHistory: (number, history) => candidates.has(number) && isSubset(candidates.get(number), history),
            visit: (number, round, history, group) => {
                visits.push([number, round, history, group]);
                if (round === 1) {
                    const boardingHistory = history | groupBits[group];
                    candidates.set(number, candidates.has(number) ? candidates.get(number) & boardingHistory : boardingHistory);
                }
            }
        });
    }
    return { bits, visits };
};
const compareQueries = (pair, ...queries) => {
    const expected = collect(pair[0], queries);
    const actual = collect(pair[1], queries);
    assert.deepEqual(actual, expected, 'column storage preserves bits and exact callback order');
    return actual;
};

{
    const pair = createPair();
    addToBoth(pair, 'S', 2, 2, 5, 'same-through-trip', 3n);
    assert.equal(addToBoth(pair, 'S', 2, 2, 5, 'same-through-trip', 7n), 3n, 'rejected same-trip arrival still returns history for through continuation');
    addToBoth(pair, 'S', 3, 2, 10, 'T', 1n);
    addToBoth(pair, 'S', 3, 2, 10, 'Other', 1n);
    assert.equal(compareQueries(pair, queryWindow(12)).bits, 3n, 'different forbidden trips merge into unrestricted permission');
}

for (const [arrival, expected] of [[9, 0n], [10, 2n], [40, 2n], [41, 0n]]) {
    const pair = createPair();
    addToBoth(pair, 'S', 3, 2, arrival, 'Other', 1n);
    assert.equal(compareQueries(pair, queryWindow(45, 5)).bits, expected, 'walking-adjusted wait window includes both endpoints');
}

{
    const pair = createPair();
    addToBoth(pair, 'S', 3, 0, 7, 'Zero', 1n);
    addToBoth(pair, 'S', 3, 1, 9, 'T', 2n);
    addToBoth(pair, 'S', 3, 1, 10, 'Other', 2n);
    addToBoth(pair, 'S', 3, 1, 11, 'Other', 4n);
    const result = compareQueries(pair, queryWindow(12));
    assert.deepEqual(result.visits.map((row) => row[1]), [1, 1, 0], 'history witnesses precede the round-zero time queue');
}

{
    const pair = createPair();
    for (const arrival of [3, 4, 5, 6]) addToBoth(pair, 'S', 2, 2, arrival, 'Cutoff', 1n);
    assert.equal(compareQueries(pair, queryWindow(35)).bits, 1n, 'the deadline-minus-wait frontier boundary retains the necessary later arrival');
    assert.equal(compareQueries(pair, queryWindow(36)).bits, 0n, 'deadline expiration remains strict');
    // Expired IDs are reused by another opportunity, never by stale frontier
    // or time-index references left behind by the expired opportunity.
    addToBoth(pair, 'S', 4, 1, 37, 'Other', 2n);
    addToBoth(pair, 'S', 4, 0, 38, 'Zero', 4n);
    compareQueries(pair, queryWindow(39));
}

{
    const pair = createPair();
    addToBoth(pair, 'S', 4, 2, 0, 'Other', 1n);
    addToBoth(pair, 'S', 4, 1, 50, 'Other', 2n);
    assert.equal(compareQueries(pair, queryWindow(20)).visits.length, 0, 'future arrival is not boardable yet');
    assert.equal(compareQueries(pair, queryWindow(40, 30)).bits, 4n, 'old arrival remains usable with a different walking penalty');
    assert.equal(compareQueries(pair, queryWindow(55)).visits.length, 1, 'cleanup does not delete future arrivals');
}

let seed = 20260901;
const random = (maximum) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % maximum;
};
{
    const pair = createPair();
    for (let minute = 0; minute <= 125; minute += 1) {
        for (let count = 0; count < 10; count += 1) {
            const number = 2 + random(4);
            const arrival = minute + random(8);
            if (arrival > opportunities[number].deadlineMin) continue;
            addToBoth(pair, random(2) ? 'S' : 'S2', number, random(3), arrival, ['T', 'Other', 'Third', null][random(4)], BigInt(random(16)));
        }
        const group = ['A', 'B', 'C', 'D'][random(4)];
        const query = queryWindow(minute, random(6));
        query.connection.toGroupKey = group;
        query.connection.arrMin += random(3);
        compareQueries(pair, query, { ...query, stopId: 'S2' });
    }
}

console.log('compact arrival store smoke ok');

import assert from 'node:assert/strict';

import { buildReachableStopsTimetableIndex } from '../src/domain/reachableStops/timetableIndex.js';
import { scanReachableStopsByDepartureOpportunity } from '../src/domain/reachableStops/opportunityPlanner.js';
import { mergeReachableStopsOpportunityResults } from '../src/domain/reachableStops/mergeOpportunityResults.js';
import { unpackReachableStopsWorkerTimetableIndex } from '../src/domain/reachableStops/workerTimetableIndex.js';
import { scanReachableStopsInParallel } from '../src/services/reachableStopsParallelScan.js';

const tripId = (name) => `Parallel.${name}.Weekday`;
const trip = (name, stops, next = []) => ({
    tripId: tripId(name),
    rawTripId: tripId(name),
    ntRefs: next.map(tripId),
    stops: stops.map(([stopId, arrMin, depMin = arrMin]) => ({ stopId, arrMin, depMin }))
});
const group = new Set(['A', 'Z']);
const branchMinutes = [20, 35, 36, 40, 41, 42];
const originCount = 389;
const index = buildReachableStopsTimetableIndex({
    serviceDay: 'Weekday',
    groupByStop: new Map([['A', group], ['Z', group]]),
    trips: [
        ...Array.from({ length: originCount }, (_, number) => trip(
            `Origin${number}`, [['O', number % 7], ['A', 10]]
        )),
        trip('First', [['A', 11], ['B', 12]]),
        trip('Second', [['B', 13], ['J', 14]], branchMinutes.map((minute) => `Through${minute}`)),
        ...branchMinutes.map((minute) => trip(`Through${minute}`, [['J', 14], [`END-${minute}`, minute]]))
    ]
});
const options = {
    index,
    originStationId: 'O',
    minutes: 30,
    optimizeTransferChecks: true,
    groupEquivalentStates: true,
    yieldEveryConnections: Number.MAX_SAFE_INTEGER
};
const reference = await scanReachableStopsByDepartureOpportunity({
    ...options, optimizeTransferChecks: false, groupEquivalentStates: false
});
const lastCount = (result, stopId) => result.remainingMsByStop.get(stopId)?.at(-1)?.count || 0;
assert.deepEqual(reference.reachableStops.slice(0, 3), ['A', 'Z', 'B'], 'station order follows sorted physical groups, not global station spelling');
assert.equal(lastCount(reference, 'J'), originCount);
for (const minute of branchMinutes) {
    const expectedCount = Array.from({ length: originCount }, (_, number) => 35 + number % 7)
        .filter((deadline) => deadline >= minute).length;
    assert.equal(lastCount(reference, `END-${minute}`), expectedCount);
}

for (const opportunityPartitionCount of [4, 6]) {
    const partials = [];
    for (let opportunityPartitionIndex = 0; opportunityPartitionIndex < opportunityPartitionCount; opportunityPartitionIndex += 1) {
        partials.push(await scanReachableStopsByDepartureOpportunity({
            ...options, opportunityPartitionIndex, opportunityPartitionCount
        }));
    }
    const originalPartials = structuredClone(partials);
    assert.deepEqual(
        mergeReachableStopsOpportunityResults(partials, index.stationIdsByGroupKey), reference,
        `${opportunityPartitionCount} partitions must preserve all batches, deadlines, branches and bucket representatives`
    );
    assert.deepEqual(mergeReachableStopsOpportunityResults([...partials].reverse(), index.stationIdsByGroupKey), reference);
    assert.deepEqual(partials, originalPartials, 'merging must not mutate partial results');
}

{
    const meta = reference.meta;
    const first = [{ remainMs: 60_000, count: 1, tripId: 'z' }, { remainMs: 0, count: 3, tripId: 'b' }];
    const second = [{ remainMs: 120_000, count: 2, tripId: 'c' }, { remainMs: 60_000, count: 4, tripId: 'a' }];
    const partial = (circles) => ({ reachableStops: ['B', 'A', 'Z'], remainingMsByStop: new Map([
        ['B', circles], ['A', circles], ['Z', circles]
    ]), meta });
    const merged = mergeReachableStopsOpportunityResults([partial(first), partial(second)], new Map([
        ['B', new Set(['B'])], ['A\u0001Z', new Set(['Z', 'A'])]
    ]));
    const expectedCircles = [
        { remainMs: 120_000, count: 2, tripId: 'c' },
        { remainMs: 60_000, count: 5, tripId: 'a' },
        { remainMs: 0, count: 7, tripId: 'b' }
    ];
    assert.deepEqual(merged, {
        reachableStops: ['A', 'Z', 'B'],
        remainingMsByStop: new Map(['A', 'Z', 'B'].map((stopId) => [stopId, expectedCircles])),
        meta
    }, 'merge bucket increments, choose the smallest representative and restore canonical group order');
}

class MockWorker {
    static instances = [];
    constructor(url, workerOptions) {
        assert.match(String(url), /reachableStopsOpportunityWorker\.js$/);
        assert.equal(workerOptions.type, 'module');
        this.onmessage = null;
        this.onerror = null;
        this.terminated = false;
        MockWorker.instances.push(this);
    }
    postMessage(data) { this.request = structuredClone(data); }
    terminate() { this.terminated = true; }
    deliver(data) { this.onmessage?.({ data }); }
}

const assertDisposed = (workers) => {
    for (const worker of workers) {
        assert.equal(worker.terminated, true);
        assert.equal(worker.onmessage, null, 'dispose must detach late message callbacks, not rely only on terminate');
        assert.equal(worker.onerror, null);
    }
};
const assertPartitions = (workers) => {
    assert.ok(workers.length > 1);
    assert.deepEqual(workers.map((worker) => worker.request.opportunityPartitionIndex), workers.map((_, number) => number));
    for (const worker of workers) assert.equal(worker.request.opportunityPartitionCount, workers.length);
};
const finishWorkers = async (workers) => {
    for (const worker of [...workers].reverse()) {
        worker.deliver({ result: await scanReachableStopsByDepartureOpportunity({
            ...worker.request,
            index: worker.request.index ?? unpackReachableStopsWorkerTimetableIndex(worker.request.packet)
        }) });
    }
};

const originalWorker = globalThis.Worker;
try {
    globalThis.Worker = undefined;
    assert.deepEqual(await scanReachableStopsInParallel(options), reference, 'without Worker the same V2 scan is used');

    globalThis.Worker = MockWorker;
    const resultPromise = scanReachableStopsInParallel(options);
    const firstWorkers = MockWorker.instances.slice();
    assertPartitions(firstWorkers);
    await finishWorkers(firstWorkers);
    assert.deepEqual(await resultPromise, reference, 'service merges all worker partitions regardless of response order');
    assertDisposed(firstWorkers);

    const controller = new AbortController();
    let delivered = false;
    const canceled = scanReachableStopsInParallel({ ...options, signal: controller.signal });
    canceled.then(() => { delivered = true; }, () => {});
    const canceledWorkers = MockWorker.instances.slice(firstWorkers.length);
    assertPartitions(canceledWorkers);
    controller.abort();
    await assert.rejects(canceled, (error) => error.name === 'AbortError');
    assertDisposed(canceledWorkers);
    // Deliberately deliver after terminate; the mock does not discard callbacks.
    for (const worker of canceledWorkers) worker.deliver({ result: reference });
    await Promise.resolve();
    assert.equal(delivered, false, 'a canceled query must never publish a late result');

    const countBeforePreAbort = MockWorker.instances.length;
    await assert.rejects(scanReachableStopsInParallel({ ...options, signal: controller.signal }), (error) => error.name === 'AbortError');
    assert.equal(MockWorker.instances.length, countBeforePreAbort, 'pre-aborted queries create no workers');

    for (const errorChannel of ['event', 'message']) {
        const before = MockWorker.instances.length;
        const failed = scanReachableStopsInParallel(options);
        const workers = MockWorker.instances.slice(before);
        const failure = new RangeError(`parallel ${errorChannel} failure`);
        if (errorChannel === 'event') workers[0].onerror({ error: failure, message: failure.message });
        else workers[0].deliver({ error: { name: failure.name, message: failure.message } });
        await assert.rejects(failed, (error) => error.name === failure.name && error.message === failure.message);
        assertDisposed(workers);
    }

    const beforeRetry = MockWorker.instances.length;
    const retried = scanReachableStopsInParallel(options);
    const retryWorkers = MockWorker.instances.slice(beforeRetry);
    assertPartitions(retryWorkers);
    await finishWorkers(retryWorkers);
    assert.deepEqual(await retried, reference, 'cancellation and failure do not affect a later independent query');
    assertDisposed(retryWorkers);
} finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
}

console.log('reachable stops opportunity parallel smoke ok');

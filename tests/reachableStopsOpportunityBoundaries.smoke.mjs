import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    scanReachableStopsByDepartureOpportunity
} from '../src/domain/reachableStops/opportunityPlanner.js';
import {
    createReachableStopsServiceDayIndexCache
} from '../src/services/reachableStopsServiceDayIndexCache.js';
import {
    buildReachableStopsTimetableIndex,
    isTripInStrictServiceDay,
    parseReachableStopsStrictTrip
} from '../src/domain/reachableStops/timetableIndex.js';

const makeTrip = ({ id, stops, nt = [], pt = [] }) => ({
    tripId: id,
    rawTripId: id,
    ntRefs: nt,
    ptRefs: pt,
    stops: stops.map(([stopId, arrMin, depMin = arrMin]) => ({ stopId, arrMin, depMin }))
});

const makeGroupIndex = (...groups) => {
    const result = new Map();
    for (const group of groups) {
        const fixed = new Set(group);
        for (const stopId of fixed) result.set(stopId, fixed);
    }
    return result;
};

const buildIndex = ({ trips, groups = [] }) => buildReachableStopsTimetableIndex({
    serviceDay: 'Weekday',
    trips,
    groupByStop: makeGroupIndex(...groups)
});

const scan = (index, originStationId, minutes, options = {}) => (
    scanReachableStopsByDepartureOpportunity({
        index,
        originStationId,
        minutes,
        yieldControl: async () => {},
        yieldEveryConnections: Number.MAX_SAFE_INTEGER,
        ...options
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

const byId = (rows, id) => rows.find((trip) => trip.id === id);

{
    const index = buildIndex({
        trips: [
            makeTrip({ id: 'X.Source.1.Weekday', stops: [['O', 0, 0], ['X', 5, 5]] }),
            makeTrip({ id: 'X.Wait30.1.Weekday', stops: [['X', 35, 35], ['D30', 40, 40]] }),
            makeTrip({ id: 'X.Wait31.1.Weekday', stops: [['X', 36, 36], ['D31', 41, 41]] })
        ]
    });
    const payload = await scan(index, 'O', 60);
    assert.equal(lastCount(payload, 'D30'), 1);
    assert.equal(lastCount(payload, 'D31'), 0);
}

{
    const trips = [makeTrip({
        id: 'X.Transfer0.1.Weekday',
        stops: [['O', 0, 0], ['S1', 1, 1]]
    })];
    for (let transfer = 1; transfer <= 4; transfer += 1) {
        trips.push(makeTrip({
            id: `X.Transfer${transfer}.1.Weekday`,
            stops: [
                [`S${transfer}`, transfer * 2, transfer * 2],
                [`S${transfer + 1}`, transfer * 2 + 1, transfer * 2 + 1]
            ]
        }));
    }
    const payload = await scan(buildIndex({ trips }), 'O', 30);
    assert.equal(lastCount(payload, 'S4'), 1);
    assert.equal(lastCount(payload, 'S5'), 0);
}

{
    const payload = await scan(buildIndex({
        trips: [
            makeTrip({ id: 'X.BucketA.1.Weekday', stops: [['O', 0, 0], ['D', 10, 10]] }),
            makeTrip({ id: 'X.BucketB.1.Weekday', stops: [['O', 5, 5], ['D', 20, 20]] })
        ]
    }), 'O', 30);
    const circles = payload.remainingMsByStop.get('D');
    assert.deepEqual(circles.map((circle) => circle.count), [1, 2]);
    for (let index = 1; index < circles.length; index += 1) {
        assert.ok(circles[index].remainMs < circles[index - 1].remainMs);
        assert.ok(circles[index].count >= circles[index - 1].count);
    }
}

{
    const stops = [];
    for (let index = 0; index <= 320; index += 1) {
        stops.push([index === 0 ? 'O' : `S${index}`, index, index]);
    }
    const index = buildIndex({
        trips: [makeTrip({ id: 'X.Abort.1.Weekday', stops })]
    });
    const controller = new AbortController();
    await assert.rejects(
        scanReachableStopsByDepartureOpportunity({
            index,
            originStationId: 'O',
            minutes: 400,
            signal: controller.signal,
            yieldEveryConnections: 256,
            yieldControl: async () => controller.abort()
        }),
        (error) => error?.name === 'AbortError'
    );
}

{
    let buildAttempts = 0;
    let releaseBuild;
    const buildGate = new Promise((resolve) => { releaseBuild = resolve; });
    const cache = createReachableStopsServiceDayIndexCache({
        buildIndex: async () => {
            buildAttempts += 1;
            await buildGate;
            return { stats: { tripCount: 2, connectionCount: 3, throughEdgeCount: 1 } };
        }
    });
    const first = cache.get('Weekday');
    const second = cache.get('Weekday');
    assert.strictEqual(first, second);
    assert.equal(buildAttempts, 0);
    releaseBuild();
    await Promise.all([first, second]);
    assert.equal(buildAttempts, 1);
    assert.deepEqual(cache.stats(), {
        serviceDayCacheCount: 1,
        buildCount: 1,
        serviceDays: [{
            serviceDay: 'Weekday',
            status: 'ready',
            tripCount: 2,
            connectionCount: 3,
            throughEdgeCount: 1
        }]
    });
}

{
    let attempts = 0;
    const cache = createReachableStopsServiceDayIndexCache({
        buildIndex: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('expected build failure');
            return { stats: {} };
        }
    });
    await assert.rejects(cache.get('Weekday'), /expected build failure/);
    assert.equal(cache.stats().serviceDayCacheCount, 0);
    await cache.get('Weekday');
    assert.equal(attempts, 2);
    assert.equal(cache.stats().buildCount, 1);
}

{
    const builtServiceDays = [];
    const cache = createReachableStopsServiceDayIndexCache({
        buildIndex: async (serviceDay) => {
            builtServiceDays.push(serviceDay);
            return { serviceDay, stats: {} };
        }
    });

    const firstWeekday = cache.get('Weekday');
    await firstWeekday;
    const secondWeekday = cache.get('Weekday');
    assert.strictEqual(secondWeekday, firstWeekday);
    await secondWeekday;
    assert.deepEqual(builtServiceDays, ['Weekday']);

    const invalidDay = cache.get('NotAServiceDay');
    assert.strictEqual(invalidDay, firstWeekday);
    await invalidDay;
    assert.equal(cache.stats().serviceDayCacheCount, 1);
    assert.deepEqual(builtServiceDays, ['Weekday']);

    const firstSaturday = cache.get('SaturdayHoliday');
    await firstSaturday;
    assert.strictEqual(cache.get('SaturdayHoliday'), firstSaturday);
    assert.deepEqual(builtServiceDays, ['Weekday', 'SaturdayHoliday']);
    assert.equal(cache.stats().serviceDayCacheCount, 2);
    assert.equal(cache.stats().buildCount, 2);

    cache.invalidate('Weekday');
    assert.deepEqual(cache.stats().serviceDays.map(({ serviceDay }) => serviceDay), ['SaturdayHoliday']);
    const rebuiltWeekday = cache.get('Weekday');
    assert.notStrictEqual(rebuiltWeekday, firstWeekday);
    await rebuiltWeekday;
    assert.deepEqual(builtServiceDays, ['Weekday', 'SaturdayHoliday', 'Weekday']);
    assert.equal(cache.stats().serviceDayCacheCount, 2);
    assert.equal(cache.stats().buildCount, 3);

    cache.invalidate();
    assert.equal(cache.stats().serviceDayCacheCount, 0);
    assert.deepEqual(cache.stats().serviceDays, []);
    assert.equal(cache.stats().buildCount, 3);
}

const [chuo, fujikyu, disney, joban, jobanRapid] = await Promise.all([
    readTrips('jreast-chuo.json'),
    readTrips('fujikyu-fujikyu.json'),
    readTrips('disney-disneyresortline.json'),
    readTrips('jreast-joban.json'),
    readTrips('jreast-jobanrapid.json')
]);

{
    const rootId = 'JR-East.Chuo.5003M.Weekday.1';
    const branchAId = 'JR-East.Chuo.5003M.Weekday.2';
    const branchBId = 'Fujikyu.Fujikyu.2103M.Weekday';
    const index = buildIndex({
        trips: [byId(chuo, rootId), byId(chuo, branchAId), byId(fujikyu, branchBId)],
        groups: [['JR-East.Chuo.Otsuki', 'Fujikyu.Fujikyu.Otsuki']]
    });
    const payload = await scan(index, 'JR-East.Chuo.Hachioji', 90);
    assert.equal(lastCount(payload, 'JR-East.Chuo.Otsuki'), 1);
    assert.equal(lastCount(payload, 'JR-East.Chuo.Kofu'), 1);
    assert.equal(lastCount(payload, 'Fujikyu.Fujikyu.Kawaguchiko'), 1);
}

{
    const rawById = new Map(
        disney
            .filter((trip) => isTripInStrictServiceDay(trip.id, 'Weekday'))
            .map((trip) => [trip.id, trip])
    );
    const chain = [];
    let currentId = 'Disney.DisneyResortLine.0603.Weekday';
    while (currentId && !chain.some((trip) => trip.id === currentId)) {
        const trip = rawById.get(currentId);
        if (!trip) break;
        chain.push(trip);
        currentId = Array.isArray(trip.nt) ? trip.nt[0] : '';
    }
    assert.equal(chain.length, 81);
    const departureMinutes = new Set(chain.map((trip) => (
        parseReachableStopsStrictTrip(trip, 'Weekday').stops[0].depMin
    )));
    assert.equal(departureMinutes.size, 81);
    const payload = await scan(
        buildIndex({ trips: chain }),
        'Disney.DisneyResortLine.ResortGateway',
        30
    );
    assert.equal(lastCount(payload, 'Disney.DisneyResortLine.TokyoDisneyland'), 81);
}

{
    const aId = 'JR-East.Joban.54M.Weekday';
    const bId = 'JR-East.JobanRapid.54M.Weekday';
    const index = buildIndex({
        trips: [byId(joban, aId), byId(jobanRapid, bId)],
        groups: [
            ['JR-East.Joban.Kashiwa', 'JR-East.JobanRapid.Kashiwa'],
            ['JR-East.Joban.Nippori', 'JR-East.JobanRapid.Nippori']
        ]
    });
    assert.equal(index.throughEdges.length, 1);
    assert.equal(index.throughEdges[0].targetEntryIndex, 1);
    const payload = await scan(index, 'JR-East.Joban.Kashiwa', 90, {
        sourceStops: [
            { stopId: 'JR-East.Joban.Kashiwa', walkMinutes: 0 },
            { stopId: 'JR-East.JobanRapid.Kashiwa', walkMinutes: 0 }
        ]
    });
    assert.equal(lastCount(payload, 'JR-East.JobanRapid.Ueno'), 1);
}

console.log('reachable stops opportunity boundaries smoke ok');

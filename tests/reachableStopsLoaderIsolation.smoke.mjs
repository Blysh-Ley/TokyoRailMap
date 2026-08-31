import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    loadReachableStopsTripsForLineAndDay
} from '../src/services/reachableStopsTripLoader.js';

globalThis.window = { location: { href: 'http://heatmap-isolation.local/index.html' } };
const shared = await import('../src/features/search/travel-search-planner-raptor.js');
const opportunity = await import('../src/features/search/travel-search-planner-opportunity.js');

const withoutExplicitTimeFlags = (trips) => trips.map((trip) => ({
    ...trip,
    stops: trip.stops.map(({ stopId, arrMin, depMin }) => ({ stopId, arrMin, depMin }))
}));

// The copied parser must keep legacy trip metadata/times, without publishing
// its extra flags or parsed objects to either of the legacy caches.
for (const fileName of [
    'chibamonorail-line1.json',
    'jreast-chuo.json',
    'jreast-joban.json',
    'disney-disneyresortline.json'
]) {
    const rows = JSON.parse(await readFile(
        new URL(`../data/train-timetables/${fileName}`, import.meta.url), 'utf8'
    ));
    const originalRows = structuredClone(rows);
    const lineId = rows.find((row) => row.r)?.r;
    assert.ok(lineId);
    const timetableCache = { get: () => rows };
    window.TokyoRailTimetableCache = timetableCache;

    for (const serviceDay of ['Weekday', 'SaturdayHoliday']) {
        for (const excludeSurchargeTypes of [false, true]) {
            shared.plannerState.lineTripsCache.clear();
            shared.plannerState.tripByIdByDay.clear();
            const options = { lineId, serviceDay, excludeSurchargeTypes };
            const legacyTrips = await shared.loadTripsForLineAndDay(options);
            const legacyIndex = shared.getDayTripMap(serviceDay);
            const originalIndexEntries = [...legacyIndex];
            const dedicatedTrips = await loadReachableStopsTripsForLineAndDay({
                ...options,
                timetableCache,
                typeMetaById: shared.plannerState.typeMetaById
            });

            assert.deepEqual(withoutExplicitTimeFlags(dedicatedTrips), legacyTrips);
            assert.deepEqual([...legacyIndex], originalIndexEntries);
            assert.strictEqual(await shared.loadTripsForLineAndDay(options), legacyTrips);
            assert.equal(shared.plannerState.lineTripsCache.size, 1);
            for (const [id, trip] of originalIndexEntries) {
                assert.strictEqual(legacyIndex.get(id), trip);
            }
            for (const trip of dedicatedTrips) {
                for (const stop of trip.stops) {
                    assert.equal(typeof stop.hasArrival, 'boolean');
                    assert.equal(typeof stop.hasDeparture, 'boolean');
                }
            }
        }
    }
    assert.deepEqual(rows, originalRows, 'the copied loader must not mutate raw timetables');
}

const lineId = 'Review.Line';
const originStationId = `${lineId}.Origin`;
const destinationStationId = `${lineId}.Destination`;
const tripId = `${lineId}.1.Weekday`;
const rawTrips = [
    { id: tripId, r: lineId, tt: [{ s: originStationId, d: '08:00' }, { s: destinationStationId, a: '08:10' }] },
    { id: `${lineId}.2.Weekday.2`, r: lineId, tt: [{ s: originStationId, d: '08:20' }, { s: destinationStationId, a: '08:30' }] },
    { id: `${lineId}.3.Saturday`, r: lineId, tt: [{ s: originStationId, d: '08:40' }, { s: destinationStationId, a: '08:50' }] },
    { id: `${lineId}.4.SaturdayHoliday`, r: lineId, tt: [{ s: originStationId, d: '09:00' }, { s: destinationStationId, a: '09:10' }] }
];
const rawSnapshot = structuredClone(rawTrips);
const getOnlyCache = { get: () => rawTrips };
window.TokyoRailTimetableCache = getOnlyCache;
shared.plannerState.staticReady = true;
shared.plannerState.routeIdsByStop = new Map([
    [originStationId, new Set([lineId])],
    [destinationStationId, new Set([lineId])]
]);
shared.plannerState.lineTripsCache.clear();
shared.plannerState.tripByIdByDay.clear();
opportunity.invalidateReachableStopsOpportunityCache();

const dedicatedTrips = await loadReachableStopsTripsForLineAndDay({
    lineId, serviceDay: 'Weekday', timetableCache: getOnlyCache
});
assert.equal(dedicatedTrips[0].stops[0].hasArrival, false);
assert.equal(dedicatedTrips[0].stops[0].hasDeparture, true);
assert.equal(dedicatedTrips[0].stops[1].hasArrival, true);
assert.equal(dedicatedTrips[0].stops[1].hasDeparture, false);
assert.equal(shared.plannerState.lineTripsCache.size, 0);
assert.equal(shared.plannerState.tripByIdByDay.size, 0);

const query = { originStationId, minutes: 30 };
const lastCount = (result) => result.remainingMsByStop.get(destinationStationId)?.at(-1)?.count;
const legacyOptions = { lineId, serviceDay: 'Weekday' };
const legacyTrips = await shared.loadTripsForLineAndDay(legacyOptions);
const legacyTrip = await shared.getParsedTripByTripId({ tripId, serviceDay: 'Weekday' });
const legacyIndex = shared.getDayTripMap('Weekday');
const sharedCacheSnapshot = structuredClone(shared.plannerState.lineTripsCache);
const sharedIndexSnapshot = structuredClone(shared.plannerState.tripByIdByDay);
assert.strictEqual(legacyTrip, legacyTrips[0]);

const assertLegacyUnchanged = async () => {
    assert.deepEqual(shared.plannerState.lineTripsCache, sharedCacheSnapshot);
    assert.deepEqual(shared.plannerState.tripByIdByDay, sharedIndexSnapshot);
    assert.strictEqual(shared.getDayTripMap('Weekday'), legacyIndex);
    assert.strictEqual(await shared.loadTripsForLineAndDay(legacyOptions), legacyTrips);
    assert.strictEqual(await shared.getParsedTripByTripId({ tripId, serviceDay: 'Weekday' }), legacyTrip);
    assert.deepEqual(Object.keys(legacyTrip.stops[0]), ['stopId', 'arrMin', 'depMin']);
};

const fallbackResult = await opportunity.getReachableStopsByDepartureOpportunity(query);
assert.equal(lastCount(fallbackResult), 2, 'V2 must retain strict day filtering on the copied-loader path');
await assertLegacyUnchanged();
assert.deepEqual(await opportunity.getReachableStopsByDepartureOpportunity(query), fallbackResult);
assert.equal(opportunity.getReachableStopsOpportunityCacheStats().buildCount, 1);
await assertLegacyUnchanged();

let preloads = 0;
window.TokyoRailTimetableCache = {
    get: () => rawTrips,
    preloadByLineIds: async () => { preloads += 1; }
};
opportunity.invalidateReachableStopsOpportunityCache();
const rawCacheResult = await opportunity.getReachableStopsByDepartureOpportunity(query);
assert.equal(preloads, 1);
assert.deepEqual(rawCacheResult, fallbackResult, 'normal and fallback paths must produce the same opportunities');
await assertLegacyUnchanged();

// Reverse call order: V2 may populate only its own service-day index.
window.TokyoRailTimetableCache = getOnlyCache;
shared.plannerState.lineTripsCache.clear();
shared.plannerState.tripByIdByDay.clear();
opportunity.invalidateReachableStopsOpportunityCache();
assert.equal(lastCount(await opportunity.getReachableStopsByDepartureOpportunity(query)), 2);
assert.equal(shared.plannerState.lineTripsCache.size, 0);
assert.equal(shared.plannerState.tripByIdByDay.size, 0);
const legacyAfterV2 = await shared.loadTripsForLineAndDay(legacyOptions);
assert.deepEqual(legacyAfterV2, legacyTrips);
assert.strictEqual(
    await shared.getParsedTripByTripId({ tripId, serviceDay: 'Weekday' }),
    legacyAfterV2[0]
);
assert.equal(lastCount(await opportunity.getReachableStopsByDepartureOpportunity({
    ...query, serviceDay: 'SaturdayHoliday'
})), 1);
assert.equal(shared.plannerState.tripByIdByDay.has('SaturdayHoliday'), false);
assert.deepEqual(rawTrips, rawSnapshot);

let available = false;
let coldPreloads = 0;
const coldTrips = await loadReachableStopsTripsForLineAndDay({
    ...legacyOptions,
    timetableCache: {
        get: () => available ? rawTrips : undefined,
        preloadByLineIds: async (lineIds) => {
            assert.deepEqual(lineIds, [lineId]);
            coldPreloads += 1;
            available = true;
        }
    }
});
assert.equal(coldPreloads, 1);
assert.deepEqual(coldTrips, dedicatedTrips);
assert.deepEqual(await loadReachableStopsTripsForLineAndDay({ lineId }), []);

console.log('reachable stops loader isolation smoke ok (16 real-data comparisons + both call orders)');

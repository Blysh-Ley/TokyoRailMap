import {
    ensurePlannerStaticData,
    filterNearbyStops,
    getGroupStops,
    getTransferPenaltyMs,
    plannerState
} from './travel-search-planner-raptor.js';
import {
    REACHABLE_STOPS_RULES,
    normalizeReachableStopsServiceDay
} from '../../domain/reachableStops/rules.js';
import {
    buildReachableStopsTimetableIndex,
    parseReachableStopsStrictTrip
} from '../../domain/reachableStops/timetableIndex.js';
import {
    scanReachableStopsByDepartureOpportunity
} from '../../domain/reachableStops/opportunityPlanner.js';
import { buildReachableStopsQueryIndex } from '../../domain/reachableStops/queryIndex.js';
import { scanReachableStopsInParallel } from '../../services/reachableStopsParallelScan.js';
import {
    createReachableStopsServiceDayIndexCache
} from '../../services/reachableStopsServiceDayIndexCache.js';
import {
    loadReachableStopsTripsForLineAndDay
} from '../../services/reachableStopsTripLoader.js';

const normalizeText = (value) => String(value ?? '').trim();
const yieldToHost = () => new Promise((resolve) => setTimeout(resolve, 0));

const throwIfAborted = (signal) => {
    if (!signal?.aborted) return;
    if (signal.reason instanceof Error) throw signal.reason;
    const error = new Error('Reachable-stops opportunity request was aborted');
    error.name = 'AbortError';
    throw error;
};

const getTimetableCache = () => (
    globalThis?.window?.TokyoRailTimetableCache || globalThis?.TokyoRailTimetableCache || null
);

const collectLineIds = () => {
    const lineIds = new Set();
    for (const routes of plannerState.routeIdsByStop?.values?.() || []) {
        if (!(routes instanceof Set) && !Array.isArray(routes)) continue;
        for (const lineId of routes) {
            const id = normalizeText(lineId);
            if (id) lineIds.add(id);
        }
    }
    return Array.from(lineIds).sort();
};

const loadStrictTripsFromRawCache = async ({ lineIds, serviceDay }) => {
    const cache = getTimetableCache();
    if (!cache || typeof cache.preloadByLineIds !== 'function' || typeof cache.get !== 'function') {
        return null;
    }

    const parsedTrips = [];
    const batchSize = 8;
    for (let start = 0; start < lineIds.length; start += batchSize) {
        const batch = lineIds.slice(start, start + batchSize);
        await cache.preloadByLineIds(batch);
        for (const lineId of batch) {
            const rows = cache.get(lineId);
            if (!Array.isArray(rows)) continue;
            for (const rawTrip of rows) {
                const parsed = parseReachableStopsStrictTrip(rawTrip, serviceDay);
                if (parsed) parsedTrips.push(parsed);
            }
        }
    }
    return parsedTrips;
};

const loadStrictTrips = async ({ lineIds, serviceDay }) => {
    const rawParsedTrips = await loadStrictTripsFromRawCache({ lineIds, serviceDay });
    if (Array.isArray(rawParsedTrips)) return rawParsedTrips;

    const tripLists = await Promise.all(lineIds.map((lineId) => (
        loadReachableStopsTripsForLineAndDay({
            lineId,
            serviceDay,
            timetableCache: getTimetableCache(),
            typeMetaById: plannerState.typeMetaById
        })
    )));
    const parsedTrips = [];
    for (const tripList of tripLists) {
        for (const trip of Array.isArray(tripList) ? tripList : []) {
            const strictTrip = parseReachableStopsStrictTrip(trip, serviceDay);
            if (strictTrip) parsedTrips.push(strictTrip);
        }
    }
    return parsedTrips;
};

const buildTransferSourcesByTargetStop = (trips) => {
    const stopIds = new Set();
    for (const trip of trips) {
        for (const stop of Array.isArray(trip?.stops) ? trip.stops : []) {
            const stopId = normalizeText(stop?.stopId);
            if (stopId) stopIds.add(stopId);
        }
    }

    const result = new Map();
    for (const targetStopId of stopIds) {
        let candidates = getGroupStops(targetStopId);
        candidates.add(targetStopId);
        candidates = filterNearbyStops(
            targetStopId,
            candidates,
            REACHABLE_STOPS_RULES.originGroupMaxDistanceMeters
        );
        const rows = [];
        for (const sourceStopId of candidates) {
            const penaltyMs = getTransferPenaltyMs(sourceStopId, targetStopId);
            if (!Number.isFinite(penaltyMs) || penaltyMs < 0) continue;
            rows.push({ stopId: sourceStopId, penaltyMin: penaltyMs / 60000 });
        }
        result.set(targetStopId, rows);
    }
    return result;
};

const buildIndex = async (serviceDay) => {
    await ensurePlannerStaticData();
    const lineIds = collectLineIds();
    const trips = await loadStrictTrips({ lineIds, serviceDay });
    return buildReachableStopsTimetableIndex({
        serviceDay,
        trips,
        groupByStop: plannerState.groupByStop,
        transferSourcesByTargetStop: buildTransferSourcesByTargetStop(trips)
    });
};

const serviceDayIndexCache = createReachableStopsServiceDayIndexCache({
    buildIndex,
    describeIndex: (index) => index?.stats || {}
});

const getIndexForServiceDay = (serviceDay = 'Weekday') => (
    serviceDayIndexCache.get(serviceDay)
);

const getOriginSourceStops = (originStationId) => {
    const originId = normalizeText(originStationId);
    let candidates = getGroupStops(originId);
    candidates.add(originId);
    candidates = filterNearbyStops(
        originId,
        candidates,
        REACHABLE_STOPS_RULES.originGroupMaxDistanceMeters
    );
    return Array.from(candidates, (stopId) => ({
        stopId,
        walkMinutes: stopId === originId ? 0 : getTransferPenaltyMs(originId, stopId) / 60000
    }));
};

export const getReachableStopsByDepartureOpportunity = async ({
    originStationId,
    minutes,
    serviceDay = 'Weekday',
    signal = null
} = {}) => {
    throwIfAborted(signal);
    const day = normalizeReachableStopsServiceDay(serviceDay);
    const index = await getIndexForServiceDay(day);
    throwIfAborted(signal);
    const sourceStops = getOriginSourceStops(originStationId);
    const useParallelScan = Number(minutes) >= 60;
    const queryIndex = useParallelScan
        ? buildReachableStopsQueryIndex({ index, originStationId, minutes, sourceStops })
        : index;
    const scan = useParallelScan ? scanReachableStopsInParallel : scanReachableStopsByDepartureOpportunity;
    return scan({
        index: queryIndex,
        originStationId,
        minutes,
        serviceDay: day,
        sourceStops,
        signal,
        yieldControl: yieldToHost,
        // The 15/30/45-minute presets have smaller arrival frontiers; avoid
        // index maintenance there. Both paths retain the same V2 semantics.
        optimizeTransferChecks: Number(minutes) >= 60,
        groupEquivalentStates: true
    });
};

export const invalidateReachableStopsOpportunityCache = (serviceDay = '') => {
    serviceDayIndexCache.invalidate(serviceDay);
};

export const getReachableStopsOpportunityCacheStats = () => (
    serviceDayIndexCache.stats()
);

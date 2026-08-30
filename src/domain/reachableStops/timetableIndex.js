import { normalizeReachableStopsServiceDay } from './rules.js';

const STRICT_SERVICE_DAY_RE = /\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/;

const normalizeText = (value) => String(value ?? '').trim();

const normalizeRefArray = (value) => {
    const source = Array.isArray(value) ? value : [value];
    return Array.from(new Set(source.map(normalizeText).filter(Boolean)));
};

export const parseReachableStopsTimetableMinute = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const match = normalizeText(value).match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const clockMinute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(clockMinute)) return null;
    if (hour < 0 || hour > 47 || clockMinute < 0 || clockMinute > 59) return null;

    let offset = hour * 60 + clockMinute - 3 * 60;
    if (offset < 0) offset += 24 * 60;
    return offset;
};

export const parseStrictTripServiceDay = (tripId) => {
    const match = normalizeText(tripId).match(STRICT_SERVICE_DAY_RE);
    return normalizeText(match?.[1]);
};

export const isTripInStrictServiceDay = (tripLike, serviceDay = 'Weekday') => {
    const tripId = normalizeText(
        typeof tripLike === 'string'
            ? tripLike
            : (tripLike?.rawTripId || tripLike?.tripId || tripLike?.id)
    );
    const day = normalizeReachableStopsServiceDay(serviceDay);
    return Boolean(tripId && parseStrictTripServiceDay(tripId) === day);
};

const getCanonicalTripId = (trip) => normalizeText(
    trip?.rawTripId || trip?.tripId || trip?.id
);

export const parseReachableStopsStrictTrip = (trip, serviceDay = 'Weekday') => {
    const tripId = getCanonicalTripId(trip);
    if (!tripId || !isTripInStrictServiceDay(tripId, serviceDay)) return null;

    const rawStops = Array.isArray(trip?.stops)
        ? trip.stops
        : (Array.isArray(trip?.tt) ? trip.tt : []);
    const stops = [];
    for (const row of rawStops) {
        const stopId = normalizeText(row?.stopId || row?.s);
        const parsedArrival = parseReachableStopsTimetableMinute(row?.arrMin ?? row?.a);
        const parsedDeparture = parseReachableStopsTimetableMinute(row?.depMin ?? row?.d);
        const hasArrival = row?.hasArrival === false ? false : parsedArrival != null;
        const hasDeparture = row?.hasDeparture === false ? false : parsedDeparture != null;
        let arrMin = parsedArrival;
        let depMin = parsedDeparture;
        if (!stopId || (arrMin == null && depMin == null)) continue;
        if (arrMin == null) arrMin = depMin;
        if (depMin == null) depMin = arrMin;
        stops.push({ stopId, arrMin, depMin, hasArrival, hasDeparture });
    }
    if (stops.length < 2) return null;

    let isMonotonic = true;
    for (let index = 0; index < stops.length; index += 1) {
        const current = stops[index];
        if (current.depMin < current.arrMin) isMonotonic = false;
        const next = stops[index + 1];
        if (next && next.arrMin < current.depMin) isMonotonic = false;
    }

    return {
        tripId,
        rawTripId: tripId,
        lineId: normalizeText(trip?.lineId || trip?.r),
        baseTripKey: normalizeText(trip?.baseTripKey || trip?.t),
        ptRefs: normalizeRefArray(trip?.ptRefs ?? trip?.pt),
        ntRefs: normalizeRefArray(trip?.ntRefs ?? trip?.nt),
        stops,
        isMonotonic
    };
};

const normalizeGroupIndex = ({ groupByStop, trips }) => {
    const groupKeyByStop = new Map();
    const stationIdsByGroupKey = new Map();

    const addGroup = (members) => {
        const ids = Array.from(new Set(
            (Array.isArray(members) ? members : Array.from(members || []))
                .map(normalizeText)
                .filter(Boolean)
        )).sort();
        if (!ids.length) return;
        const groupKey = ids.join('|');
        if (!stationIdsByGroupKey.has(groupKey)) stationIdsByGroupKey.set(groupKey, new Set());
        const fixedMembers = stationIdsByGroupKey.get(groupKey);
        for (const stopId of ids) {
            fixedMembers.add(stopId);
            groupKeyByStop.set(stopId, groupKey);
        }
    };

    if (groupByStop instanceof Map) {
        for (const [rawStopId, rawMembers] of groupByStop.entries()) {
            const stopId = normalizeText(rawStopId);
            const members = rawMembers instanceof Set || Array.isArray(rawMembers)
                ? Array.from(rawMembers)
                : [];
            if (stopId) members.push(stopId);
            addGroup(members);
        }
    }

    for (const trip of trips) {
        for (const stop of trip.stops) {
            if (groupKeyByStop.has(stop.stopId)) continue;
            addGroup([stop.stopId]);
        }
    }

    return { groupKeyByStop, stationIdsByGroupKey };
};

const getPhysicalGroupKey = (stop, groupKeyByStop) => (
    groupKeyByStop.get(stop.stopId) || stop.stopId
);

const overlapLegsMatch = ({ sourceFrom, sourceTo, targetFrom, targetTo, groupKeyByStop }) => (
    sourceFrom.hasDeparture &&
    targetFrom.hasDeparture &&
    sourceTo.hasArrival &&
    targetTo.hasArrival &&
    getPhysicalGroupKey(sourceFrom, groupKeyByStop) === getPhysicalGroupKey(targetFrom, groupKeyByStop) &&
    getPhysicalGroupKey(sourceTo, groupKeyByStop) === getPhysicalGroupKey(targetTo, groupKeyByStop) &&
    sourceFrom.depMin === targetFrom.depMin &&
    sourceTo.arrMin === targetTo.arrMin
);

const findThroughAlignment = ({ sourceTrip, targetTrip, groupKeyByStop }) => {
    if (!sourceTrip?.isMonotonic || !targetTrip?.isMonotonic) return null;

    const sourceStops = sourceTrip.stops;
    const targetStops = targetTrip.stops;
    const sourceLast = sourceStops[sourceStops.length - 1];
    const sourceLastGroup = groupKeyByStop.get(sourceLast.stopId) || sourceLast.stopId;
    const targetFirst = targetStops[0];
    const targetFirstGroup = groupKeyByStop.get(targetFirst.stopId) || targetFirst.stopId;

    if (
        sourceLastGroup === targetFirstGroup &&
        targetFirst.hasDeparture &&
        targetFirst.depMin >= sourceLast.arrMin
    ) {
        return {
            sourceExitIndex: sourceStops.length - 1,
            targetEntryIndex: 0,
            overlapLength: 1,
            boundaryArrMin: sourceLast.arrMin,
            boundaryDepMin: targetFirst.depMin
        };
    }

    const maxOverlapIndex = Math.min(targetStops.length - 1, sourceStops.length - 1);
    for (let targetEntryIndex = maxOverlapIndex; targetEntryIndex >= 1; targetEntryIndex -= 1) {
        const overlapLength = targetEntryIndex + 1;
        const sourceStartIndex = sourceStops.length - overlapLength;
        let matches = true;

        for (let offset = 0; offset < overlapLength - 1; offset += 1) {
            if (!overlapLegsMatch({
                sourceFrom: sourceStops[sourceStartIndex + offset],
                sourceTo: sourceStops[sourceStartIndex + offset + 1],
                targetFrom: targetStops[offset],
                targetTo: targetStops[offset + 1],
                groupKeyByStop
            })) {
                matches = false;
                break;
            }
        }

        if (!matches) continue;
        const targetEntry = targetStops[targetEntryIndex];
        if (!targetEntry.hasDeparture) continue;
        if (targetEntry.depMin < sourceLast.arrMin) continue;
        return {
            sourceExitIndex: sourceStops.length - 1,
            targetEntryIndex,
            overlapLength,
            boundaryArrMin: sourceLast.arrMin,
            boundaryDepMin: targetEntry.depMin
        };
    }

    return null;
};

const collectCycleComponentByTripId = ({ tripIds, edges }) => {
    const graph = new Map(tripIds.map((tripId) => [tripId, []]));
    for (const edge of edges) graph.get(edge.sourceTripId)?.push(edge.targetTripId);

    let nextIndex = 0;
    const indexByTripId = new Map();
    const lowLinkByTripId = new Map();
    const stack = [];
    const onStack = new Set();
    const cycleComponentByTripId = new Map();

    const visit = (tripId) => {
        indexByTripId.set(tripId, nextIndex);
        lowLinkByTripId.set(tripId, nextIndex);
        nextIndex += 1;
        stack.push(tripId);
        onStack.add(tripId);

        for (const targetTripId of graph.get(tripId) || []) {
            if (!indexByTripId.has(targetTripId)) {
                visit(targetTripId);
                lowLinkByTripId.set(
                    tripId,
                    Math.min(lowLinkByTripId.get(tripId), lowLinkByTripId.get(targetTripId))
                );
            } else if (onStack.has(targetTripId)) {
                lowLinkByTripId.set(
                    tripId,
                    Math.min(lowLinkByTripId.get(tripId), indexByTripId.get(targetTripId))
                );
            }
        }

        if (lowLinkByTripId.get(tripId) !== indexByTripId.get(tripId)) return;
        const component = [];
        while (stack.length) {
            const member = stack.pop();
            onStack.delete(member);
            component.push(member);
            if (member === tripId) break;
        }

        const hasSelfLoop = component.length === 1 && (graph.get(component[0]) || []).includes(component[0]);
        if (component.length <= 1 && !hasSelfLoop) return;
        const componentId = component.slice().sort()[0];
        for (const member of component) cycleComponentByTripId.set(member, componentId);
    };

    for (const tripId of tripIds) {
        if (!indexByTripId.has(tripId)) visit(tripId);
    }
    return cycleComponentByTripId;
};

const buildThroughEdges = ({ trips, tripById, ambiguousTripIds, groupKeyByStop }) => {
    const candidateByKey = new Map();
    let missingReferenceCount = 0;

    const addCandidate = (sourceTrip, targetTrip, evidence) => {
        if (!sourceTrip || !targetTrip) {
            missingReferenceCount += 1;
            return;
        }
        const key = `${sourceTrip.tripId}->${targetTrip.tripId}`;
        if (!candidateByKey.has(key)) {
            candidateByKey.set(key, {
                sourceTrip,
                targetTrip,
                linkedByNt: false,
                linkedByPt: false
            });
        }
        candidateByKey.get(key)[evidence] = true;
    };

    const resolveTrip = (tripId) => {
        const id = normalizeText(tripId);
        if (!id || ambiguousTripIds.has(id)) return null;
        return tripById.get(id) || null;
    };

    for (const trip of trips) {
        for (const refId of trip.ntRefs) {
            addCandidate(trip, resolveTrip(refId), 'linkedByNt');
        }
        for (const refId of trip.ptRefs) {
            addCandidate(resolveTrip(refId), trip, 'linkedByPt');
        }
    }

    const alignedEdges = [];
    let rejectedAlignmentCount = 0;
    for (const candidate of candidateByKey.values()) {
        const alignment = findThroughAlignment({
            sourceTrip: candidate.sourceTrip,
            targetTrip: candidate.targetTrip,
            groupKeyByStop
        });
        if (!alignment) {
            rejectedAlignmentCount += 1;
            continue;
        }
        alignedEdges.push({
            sourceTripId: candidate.sourceTrip.tripId,
            targetTripId: candidate.targetTrip.tripId,
            linkedByNt: candidate.linkedByNt,
            linkedByPt: candidate.linkedByPt,
            ...alignment
        });
    }

    const cycleComponentByTripId = collectCycleComponentByTripId({
        tripIds: trips.map((trip) => trip.tripId),
        edges: alignedEdges
    });
    let rejectedCycleEdgeCount = 0;
    const throughEdges = alignedEdges.filter((edge) => {
        const sourceCycle = cycleComponentByTripId.get(edge.sourceTripId);
        const targetCycle = cycleComponentByTripId.get(edge.targetTripId);
        const isCycleEdge = Boolean(sourceCycle && sourceCycle === targetCycle);
        if (isCycleEdge) rejectedCycleEdgeCount += 1;
        return !isCycleEdge;
    });

    return {
        throughEdges,
        diagnostics: {
            missingReferenceCount,
            rejectedAlignmentCount,
            rejectedCycleEdgeCount
        }
    };
};

const buildThroughComponents = ({ trips, throughEdges }) => {
    const neighbors = new Map(trips.map((trip) => [trip.tripId, new Set()]));
    for (const edge of throughEdges) {
        neighbors.get(edge.sourceTripId)?.add(edge.targetTripId);
        neighbors.get(edge.targetTripId)?.add(edge.sourceTripId);
    }

    const componentIdByTripId = new Map();
    for (const trip of trips) {
        if (componentIdByTripId.has(trip.tripId)) continue;
        const queue = [trip.tripId];
        const members = [];
        componentIdByTripId.set(trip.tripId, '');
        while (queue.length) {
            const current = queue.shift();
            members.push(current);
            for (const neighbor of neighbors.get(current) || []) {
                if (componentIdByTripId.has(neighbor)) continue;
                componentIdByTripId.set(neighbor, '');
                queue.push(neighbor);
            }
        }
        const componentId = members.slice().sort()[0];
        for (const member of members) componentIdByTripId.set(member, componentId);
    }
    return componentIdByTripId;
};

const normalizeTransferSources = ({ transferSourcesByTargetStop, stopIds }) => {
    const out = new Map();
    for (const targetStopId of stopIds) {
        const rows = transferSourcesByTargetStop instanceof Map
            ? transferSourcesByTargetStop.get(targetStopId)
            : null;
        const bySource = new Map();
        for (const row of Array.isArray(rows) ? rows : []) {
            const stopId = normalizeText(row?.stopId);
            const penaltyMin = Number(row?.penaltyMin ?? (Number(row?.penaltyMs) / 60000));
            if (!stopId || !Number.isFinite(penaltyMin) || penaltyMin < 0) continue;
            const previous = bySource.get(stopId);
            if (!Number.isFinite(previous) || penaltyMin < previous) bySource.set(stopId, penaltyMin);
        }
        if (!bySource.has(targetStopId)) bySource.set(targetStopId, 0);
        out.set(
            targetStopId,
            Array.from(bySource, ([stopId, penaltyMin]) => ({ stopId, penaltyMin }))
                .sort((a, b) => a.penaltyMin - b.penaltyMin || a.stopId.localeCompare(b.stopId))
        );
    }
    return out;
};

export const buildReachableStopsTimetableIndex = ({
    serviceDay = 'Weekday',
    trips: rawTrips = [],
    groupByStop = new Map(),
    transferSourcesByTargetStop = new Map()
} = {}) => {
    const day = normalizeReachableStopsServiceDay(serviceDay);
    const trips = [];
    const tripById = new Map();
    const ambiguousTripIds = new Set();

    for (const rawTrip of Array.isArray(rawTrips) ? rawTrips : []) {
        const trip = parseReachableStopsStrictTrip(rawTrip, day);
        if (!trip) continue;
        if (tripById.has(trip.tripId)) {
            ambiguousTripIds.add(trip.tripId);
            continue;
        }
        tripById.set(trip.tripId, trip);
        trips.push(trip);
    }
    for (const tripId of ambiguousTripIds) tripById.delete(tripId);

    const unambiguousTrips = trips.filter((trip) => !ambiguousTripIds.has(trip.tripId));
    const { groupKeyByStop, stationIdsByGroupKey } = normalizeGroupIndex({
        groupByStop,
        trips: unambiguousTrips
    });
    const { throughEdges, diagnostics } = buildThroughEdges({
        trips: unambiguousTrips,
        tripById,
        ambiguousTripIds,
        groupKeyByStop
    });
    const componentIdByTripId = buildThroughComponents({ trips: unambiguousTrips, throughEdges });

    const connections = [];
    const stopIds = new Set();
    for (const trip of unambiguousTrips) {
        for (let fromIndex = 0; fromIndex < trip.stops.length - 1; fromIndex += 1) {
            const fromStop = trip.stops[fromIndex];
            const toStop = trip.stops[fromIndex + 1];
            if (!fromStop.hasDeparture || toStop.arrMin < fromStop.depMin) continue;
            stopIds.add(fromStop.stopId);
            stopIds.add(toStop.stopId);
            connections.push({
                id: `${trip.tripId}#${fromIndex}`,
                tripId: trip.tripId,
                throughComponentId: componentIdByTripId.get(trip.tripId) || trip.tripId,
                fromIndex,
                toIndex: fromIndex + 1,
                fromStopId: fromStop.stopId,
                toStopId: toStop.stopId,
                fromGroupKey: groupKeyByStop.get(fromStop.stopId) || fromStop.stopId,
                toGroupKey: groupKeyByStop.get(toStop.stopId) || toStop.stopId,
                depMin: fromStop.depMin,
                arrMin: toStop.arrMin
            });
        }
    }
    connections.sort((a, b) => (
        a.depMin - b.depMin ||
        a.arrMin - b.arrMin ||
        a.tripId.localeCompare(b.tripId) ||
        a.fromIndex - b.fromIndex
    ));

    const connectionsByTripId = new Map();
    for (let scanIndex = 0; scanIndex < connections.length; scanIndex += 1) {
        const connection = connections[scanIndex];
        connection.scanIndex = scanIndex;
        if (!connectionsByTripId.has(connection.tripId)) {
            connectionsByTripId.set(connection.tripId, []);
        }
        connectionsByTripId.get(connection.tripId)[connection.fromIndex] = connection;
    }
    const normalizedTransferSourcesByTargetStop = normalizeTransferSources({
        transferSourcesByTargetStop,
        stopIds
    });
    const throughEdgesFromTripId = new Map();
    for (const edge of throughEdges) {
        if (!throughEdgesFromTripId.has(edge.sourceTripId)) {
            throughEdgesFromTripId.set(edge.sourceTripId, []);
        }
        throughEdgesFromTripId.get(edge.sourceTripId).push(edge);
    }
    for (const edges of throughEdgesFromTripId.values()) {
        edges.sort((a, b) => (
            a.targetTripId.localeCompare(b.targetTripId) || a.targetEntryIndex - b.targetEntryIndex
        ));
    }

    return {
        serviceDay: day,
        trips: unambiguousTrips,
        tripById,
        connections,
        connectionsByTripId,
        throughEdges,
        throughEdgesFromTripId,
        componentIdByTripId,
        groupKeyByStop,
        stationIdsByGroupKey,
        transferSourcesByTargetStop: normalizedTransferSourcesByTargetStop,
        stats: Object.freeze({
            tripCount: unambiguousTrips.length,
            connectionCount: connections.length,
            throughEdgeCount: throughEdges.length,
            ambiguousTripIdCount: ambiguousTripIds.size,
            ...diagnostics
        })
    };
};

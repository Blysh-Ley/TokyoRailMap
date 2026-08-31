import { getReachableStopsPlanningBudgetMinutes } from './rules.js';

const normalizeText = (value) => String(value ?? '').trim();
// This is only a pruning bound; retaining a near-boundary connection is safe.
const BOUNDARY_TOLERANCE_MINUTES = 1e-7;

const getSourceWalks = (originStationId, sourceStops) => {
    const walks = new Map();
    const add = (stopId, walkMinutes) => {
        const id = normalizeText(stopId);
        const walk = Number(walkMinutes);
        if (!id || !Number.isFinite(walk) || walk < 0) return;
        const previous = walks.get(id);
        if (previous === undefined || walk < previous) walks.set(id, walk);
    };
    if (sourceStops instanceof Map) {
        for (const [stopId, walkMinutes] of sourceStops) add(stopId, walkMinutes);
    } else if (Array.isArray(sourceStops) || sourceStops instanceof Set) {
        for (const source of sourceStops) {
            if (typeof source === 'string') add(source, 0);
            else add(source?.stopId, source?.walkMinutes ?? source?.penaltyMin ?? 0);
        }
    }
    const originId = normalizeText(originStationId);
    if (originId && !walks.has(originId)) walks.set(originId, 0);
    return walks;
};

const pushMinimum = (heap, entry) => {
    let position = heap.length;
    heap.push(entry);
    while (position > 0) {
        const parent = (position - 1) >> 1;
        if (heap[parent][1] <= entry[1]) break;
        heap[position] = heap[parent];
        position = parent;
    }
    heap[position] = entry;
};

const popMinimum = (heap) => {
    const first = heap[0];
    const last = heap.pop();
    if (!heap.length) return first;
    let position = 0;
    while (position * 2 + 1 < heap.length) {
        let child = position * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1][1] < heap[child][1]) child += 1;
        if (heap[child][1] >= last[1]) break;
        heap[position] = heap[child];
        position = child;
    }
    heap[position] = last;
    return first;
};

// Heatmap-only, query-local lower bound. It deliberately ignores timetables,
// waits, transfer-count limits and visited groups, so it can only under-estimate
// travel time. The cached timetable index and its connection IDs stay intact.
export const buildReachableStopsQueryIndex = ({
    index,
    originStationId,
    minutes,
    sourceStops = null
}) => {
    const requestedMinutes = Number(minutes);
    const planningBudgetMinutes = getReachableStopsPlanningBudgetMinutes(requestedMinutes);
    const sourceWalks = getSourceWalks(originStationId, sourceStops);
    const filterStats = {
        applied: true,
        planningBudgetMinutes,
        sourceStopCount: sourceWalks.size,
        seedWalkMinutes: null,
        inputConnectionCount: index.connections.length,
        retainedConnectionCount: index.connections.length,
        removedConnectionCount: 0,
        lowerBoundStopCount: 0
    };
    const adjacency = new Map();
    const addEdge = (fromStopId, toStopId, cost) => {
        let targets = adjacency.get(fromStopId);
        if (!targets) {
            targets = new Map();
            adjacency.set(fromStopId, targets);
        }
        const previous = targets.get(toStopId);
        if (previous === undefined || cost < previous) targets.set(toStopId, cost);
    };
    for (const connection of index.connections) {
        const duration = connection.arrMin - connection.depMin;
        addEdge(connection.fromStopId, connection.toStopId, duration);
    }
    for (const [targetStopId, sources] of index.transferSourcesByTargetStop) {
        for (const source of sources) addEdge(source.stopId, targetStopId, source.penaltyMin);
    }
    for (const edges of index.throughEdgesFromTripId.values()) {
        for (const edge of edges) {
            const source = index.tripById.get(edge.sourceTripId).stops.at(-1);
            const target = index.tripById.get(edge.targetTripId).stops[edge.targetEntryIndex];
            addEdge(source.stopId, target.stopId, 0);
        }
    }

    // One departure opportunity may use the minimum walk from another origin
    // platform. Seeding each platform with its own walk would over-estimate
    // some legal paths. The global minimum is conservative for every member.
    let seedWalkMinutes = Infinity;
    for (const walk of sourceWalks.values()) seedWalkMinutes = Math.min(seedWalkMinutes, walk);
    const distances = new Map();
    const heap = [];
    for (const stopId of sourceWalks.keys()) {
        distances.set(stopId, seedWalkMinutes);
        pushMinimum(heap, [stopId, seedWalkMinutes]);
    }
    const limit = planningBudgetMinutes + BOUNDARY_TOLERANCE_MINUTES;
    while (heap.length) {
        const [stopId, distance] = popMinimum(heap);
        if (distances.get(stopId) !== distance) continue;
        if (distance > limit) break;
        for (const [targetStopId, cost] of adjacency.get(stopId) || []) {
            const candidate = distance + cost;
            if (candidate > limit || candidate >= (distances.get(targetStopId) ?? Infinity)) continue;
            distances.set(targetStopId, candidate);
            pushMinimum(heap, [targetStopId, candidate]);
        }
    }

    const connections = index.connections.filter((connection) => (
        // Preserve every origin departure, even when its first leg is too long:
        // buildStartOpportunities must keep the same IDs and shared walk costs.
        sourceWalks.has(connection.fromStopId) ||
        (distances.get(connection.fromStopId) ?? Infinity) + (connection.arrMin - connection.depMin) <= limit
    ));
    const completedStats = {
        ...filterStats,
        applied: true,
        seedWalkMinutes,
        retainedConnectionCount: connections.length,
        removedConnectionCount: index.connections.length - connections.length,
        lowerBoundStopCount: distances.size
    };
    const connectionsByTripId = new Map();
    const tripById = new Map();
    for (const connection of connections) {
        let rows = connectionsByTripId.get(connection.tripId);
        if (!rows) {
            rows = new Array(index.connectionsByTripId.get(connection.tripId).length);
            connectionsByTripId.set(connection.tripId, rows);
            tripById.set(connection.tripId, index.tripById.get(connection.tripId));
        }
        rows[connection.fromIndex] = connection;
    }
    const throughEdgesFromTripId = new Map();
    for (const [sourceTripId, edges] of index.throughEdgesFromTripId) {
        if (!tripById.has(sourceTripId)) continue;
        const retainedEdges = edges.filter((edge) => tripById.has(edge.targetTripId));
        if (retainedEdges.length) throughEdgesFromTripId.set(sourceTripId, retainedEdges);
    }
    return {
        ...index,
        connections,
        connectionsByTripId,
        tripById,
        throughEdgesFromTripId,
        filterStats: completedStats
    };
};

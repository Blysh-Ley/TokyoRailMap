import { ensurePlannerStaticData, plannerState, getGroupStops, filterNearbyStops, normalizeText, getTransferPenaltyMs, loadTripsForLineAndDay } from './travel-search-planner-raptor.js';

const MIN_TRANSFER_MS = 3 * 60 * 1000;

class MaxHeap {
    constructor() { this.data = []; }
    push(item) {
        this.data.push(item);
        this.up(this.data.length - 1);
    }
    pop() {
        if (!this.data.length) return null;
        const top = this.data[0];
        const bottom = this.data.pop();
        if (this.data.length) {
            this.data[0] = bottom;
            this.down(0);
        }
        return top;
    }
    up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.data[p].remainingMs >= this.data[i].remainingMs) break;
            const tmp = this.data[p];
            this.data[p] = this.data[i];
            this.data[i] = tmp;
            i = p;
        }
    }
    down(i) {
        const len = this.data.length;
        while (true) {
            let left = (i << 1) + 1;
            let right = left + 1;
            let max = i;
            if (left < len && this.data[left].remainingMs > this.data[max].remainingMs) max = left;
            if (right < len && this.data[right].remainingMs > this.data[max].remainingMs) max = right;
            if (max === i) break;
            const tmp = this.data[i];
            this.data[i] = this.data[max];
            this.data[max] = tmp;
            i = max;
        }
    }
    isEmpty() { return this.data.length === 0; }
}

export const getReachableStopsWithinMinutes = async ({ originStationId, minutes }) => {
    await ensurePlannerStaticData();
    const originId = normalizeText(originStationId);
    const mins = Number(minutes) + 5;
    const durationBudgetMs = Math.round(mins) * 60000; 
    const dynamicRoundCircleRadiusMs = Math.min(Number(minutes) / 6 * 60000, 1200000); // 动态允许步行时长，不超过1/6的时间或不超过20分钟

    if (!originId || !Number.isFinite(mins) || mins < 0) return { reachableStops: [], remainingMsByStop: new Map() };

    let sourceStops = getGroupStops(originId);
    sourceStops.add(originId);
    sourceStops = filterNearbyStops(originId, sourceStops, 800);

    if (!sourceStops.size) return { reachableStops: [], remainingMsByStop: new Map() };

    const lineEdgesCache = new Map();
    const pq = new MaxHeap();
    const bestRem = new Map();
    const remainingMsByStopMap = new Map();

    const pushArrival = (stopId, rem) => {
        if (!remainingMsByStopMap.has(stopId)) remainingMsByStopMap.set(stopId, []);
        
        const recordedRem = Math.max(dynamicRoundCircleRadiusMs, rem);
        remainingMsByStopMap.get(stopId).push(recordedRem);

        const currentBest = bestRem.get(stopId) ?? -1;
        if (rem > currentBest) {
            bestRem.set(stopId, rem);
            pq.push({ stopId, remainingMs: rem });
            return true;
        }
        return false;
    };

    for (const sid of sourceStops) {
        pushArrival(sid, durationBudgetMs);
    }

    const getLineEdges = async (lineId) => {
        if (lineEdgesCache.has(lineId)) return lineEdgesCache.get(lineId);
        
        const trips = await loadTripsForLineAndDay({ lineId, serviceDay: 'Weekday' });
        const edges = new Map(); 
        
        for (const trip of (trips || [])) {
            const stops = Array.isArray(trip.stops) ? trip.stops : [];
            for (let i = 0; i < stops.length - 1; i++) {
                const s1 = stops[i];
                const s2 = stops[i + 1];
                const u = normalizeText(s1?.stopId);
                const v = normalizeText(s2?.stopId);
                if (!u || !v || !Number.isFinite(s1.depMin) || !Number.isFinite(s2.arrMin)) continue;

                const timeMs = (s2.arrMin - s1.depMin) * 60000;
                if (timeMs >= 0) {
                    if (!edges.has(u)) edges.set(u, new Map());
                    if (!edges.get(u).has(v)) edges.get(u).set(v, new Set());
                    edges.get(u).get(v).add(timeMs);
                }
            }
        }

        const flattened = new Map();
        for (const [u, vMap] of edges) {
            flattened.set(u, []);
            for (const [v, timeSet] of vMap) {
                flattened.get(u).push({ toStopId: v, times: Array.from(timeSet) });
            }
        }
        lineEdgesCache.set(lineId, flattened);
        return flattened;
    };

    while (!pq.isEmpty()) {
        const { stopId: u, remainingMs } = pq.pop();

        if (remainingMs < bestRem.get(u)) continue;

        let transfers = getGroupStops(u);
        transfers.add(u);
        transfers = filterNearbyStops(u, transfers, 800);
        
        for (const v of transfers) {
            if (v === u) continue;
            const penalty = Math.max(MIN_TRANSFER_MS, getTransferPenaltyMs(u, v));
            const nextRem = remainingMs - penalty;
            if (nextRem >= 0) {
                pushArrival(v, nextRem);
            }
        }

        const activeLines = plannerState.routeIdsByStop.get(u);
        if (activeLines) {
            for (const lineId of activeLines) {
                const edgesMap = await getLineEdges(lineId);
                const neighbors = edgesMap.get(u);
                if (!neighbors) continue;
                for (const edge of neighbors) {
                    const v = edge.toStopId;
                    for (const t of edge.times) {
                        const nextRem = remainingMs - t;
                        if (nextRem >= 0) {
                            pushArrival(v, nextRem);
                        }
                    }
                }
            }
        }
    }

    const reachableSet = new Set(remainingMsByStopMap.keys());
    return {
        reachableStops: Array.from(reachableSet),
        remainingMsByStop: remainingMsByStopMap
    };
};

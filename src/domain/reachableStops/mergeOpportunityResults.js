// Partitions contain disjoint origin opportunities. Merge bucket increments,
// not cumulative counts, so every opportunity is still counted exactly once.
export const mergeReachableStopsOpportunityResults = (results, stationIdsByGroupKey) => {
    const bucketsByStop = new Map();
    for (const result of results) {
        for (const [stopId, circles] of result.remainingMsByStop) {
            let buckets = bucketsByStop.get(stopId);
            if (!buckets) {
                buckets = new Map();
                bucketsByStop.set(stopId, buckets);
            }
            let previousCount = 0;
            for (const circle of circles) {
                const count = circle.count - previousCount;
                previousCount = circle.count;
                const existing = buckets.get(circle.remainMs);
                if (existing) {
                    existing.count += count;
                    if (circle.tripId < existing.tripId) existing.tripId = circle.tripId;
                } else {
                    buckets.set(circle.remainMs, { ...circle, count });
                }
            }
        }
    }
    const remainingMsByStop = new Map();
    const orderedStopIds = new Set();
    for (const groupKey of Array.from(stationIdsByGroupKey.keys()).sort()) {
        for (const stopId of Array.from(stationIdsByGroupKey.get(groupKey)).sort()) {
            if (bucketsByStop.has(stopId)) orderedStopIds.add(stopId);
        }
    }
    for (const stopId of orderedStopIds) {
        const buckets = bucketsByStop.get(stopId);
        let cumulativeCount = 0;
        const circles = Array.from(buckets.values()).sort((a, b) => b.remainMs - a.remainMs);
        for (const circle of circles) {
            cumulativeCount += circle.count;
            circle.count = cumulativeCount;
        }
        remainingMsByStop.set(stopId, circles);
    }
    return {
        reachableStops: Array.from(remainingMsByStop.keys()),
        remainingMsByStop,
        meta: results[0].meta
    };
};

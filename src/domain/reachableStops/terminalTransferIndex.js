const upperBoundByArrival = (rows, minute) => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (rows[middle].arrMin <= minute) low = middle + 1;
        else high = middle;
    }
    return low;
};

// With no ordinary transfers left after boarding, one legal arrival is enough
// for an opportunity. Keep the original labels: frontier invalidation and
// permission/history changes must remain visible to these queries.
export const createTerminalTransferIndex = ({ getOpportunityBit, hasVisitedGroup, onExpire }) => {
    const byStopId = new Map();
    const lastPruneMinuteByStopId = new Map();

    const pruneExpiredAndInactive = (stopId, currentMinute) => {
        const byOpportunity = byStopId.get(stopId);
        if (!byOpportunity) return null;
        const previousMinute = lastPruneMinuteByStopId.get(stopId);
        if (previousMinute !== undefined && currentMinute - previousMinute < 5) return byOpportunity;
        lastPruneMinuteByStopId.set(stopId, currentMinute);
        for (const [opportunityNumber, bucket] of byOpportunity) {
            if (bucket.deadlineMin < currentMinute) {
                byOpportunity.delete(opportunityNumber);
                onExpire?.(stopId, opportunityNumber);
                continue;
            }
            const rows = bucket.rows;
            let activeCount = 0;
            for (const state of rows) {
                if (state.active) rows[activeCount++] = state;
            }
            rows.length = activeCount;
            // An empty local bucket does not expire other transfer rounds.
            if (!activeCount) byOpportunity.delete(opportunityNumber);
        }
        if (byOpportunity.size) return byOpportunity;
        byStopId.delete(stopId);
        lastPruneMinuteByStopId.delete(stopId);
        return null;
    };

    const add = (stopId, label) => {
        let byOpportunity = byStopId.get(stopId);
        if (!byOpportunity) {
            byOpportunity = new Map();
            byStopId.set(stopId, byOpportunity);
        }
        let bucket = byOpportunity.get(label.opportunityNumber);
        if (!bucket) {
            bucket = {
                bit: getOpportunityBit(label.opportunityNumber),
                deadlineMin: label.deadlineMin,
                rows: []
            };
            byOpportunity.set(label.opportunityNumber, bucket);
        }
        const rows = bucket.rows;
        if (!rows.length || rows[rows.length - 1].arrMin <= label.arrMin) rows.push(label);
        else rows.splice(upperBoundByArrival(rows, label.arrMin), 0, label);
    };

    const findBoardableBits = ({
        stopId,
        connection,
        minArrivalMinute,
        maxArrivalMinute,
        alreadyBoardedBits = 0n
    }) => {
        const byOpportunity = pruneExpiredAndInactive(stopId, connection.depMin);
        if (!byOpportunity) return alreadyBoardedBits;
        let bits = alreadyBoardedBits;
        const checkForbiddenTrip = stopId === connection.fromStopId;
        const checkHistory = connection.toGroupKey !== connection.fromGroupKey;
        for (const [opportunityNumber, bucket] of byOpportunity) {
            if (bucket.deadlineMin < connection.depMin) {
                byOpportunity.delete(opportunityNumber);
                onExpire?.(stopId, opportunityNumber);
                continue;
            }
            if ((bits & bucket.bit) !== 0n || bucket.deadlineMin < connection.arrMin) continue;
            const rows = bucket.rows;
            if (
                !rows.length ||
                rows[rows.length - 1].arrMin < minArrivalMinute ||
                rows[0].arrMin > maxArrivalMinute
            ) continue;
            // Later arrivals are commonly still active and within the wait
            // window; binary search avoids revisiting the expired prefix.
            for (let rowIndex = upperBoundByArrival(rows, maxArrivalMinute) - 1; rowIndex >= 0; rowIndex -= 1) {
                const state = rows[rowIndex];
                if (state.arrMin < minArrivalMinute) break;
                if (!state.active) continue;
                if (checkForbiddenTrip && state.forbiddenTripId === connection.tripId) continue;
                if (checkHistory && hasVisitedGroup(state.visitedGroups, connection.toGroupKey)) continue;
                bits |= bucket.bit;
                break;
            }
        }
        if (!byOpportunity.size) {
            byStopId.delete(stopId);
            lastPruneMinuteByStopId.delete(stopId);
        }
        return bits;
    };

    return { add, findBoardableBits };
};

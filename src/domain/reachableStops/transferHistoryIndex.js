const lowerBoundByArrival = (rows, minute) => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (rows[middle].arrMin < minute) low = middle + 1;
        else high = middle;
    }
    return low;
};

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

// Accepted round-one arrivals with the same history become the same boarding
// state after one legal witness is found. Keep shared labels so later frontier
// invalidation and forbidden-trip changes are observed; history/time stay fixed.
export const createTransferHistoryIndex = ({ hasVisitedGroup, onExpire }) => {
    const byStopId = new Map();
    const lastPruneMinuteByStopId = new Map();

    const pruneExpiredAndInactive = (stopId, currentMinute) => {
        const byOpportunity = byStopId.get(stopId);
        if (!byOpportunity) return null;
        const previousMinute = lastPruneMinuteByStopId.get(stopId);
        if (previousMinute !== undefined && currentMinute - previousMinute < 5) return byOpportunity;
        lastPruneMinuteByStopId.set(stopId, currentMinute);
        for (const [opportunityNumber, opportunity] of byOpportunity) {
            if (opportunity.deadlineMin < currentMinute) {
                byOpportunity.delete(opportunityNumber);
                onExpire?.(stopId, opportunityNumber);
                continue;
            }
            for (const [history, rows] of opportunity.rowsByHistory) {
                let activeCount = 0;
                for (const state of rows) {
                    if (state.active) rows[activeCount++] = state;
                }
                rows.length = activeCount;
                if (!activeCount) opportunity.rowsByHistory.delete(history);
            }
            // Empty histories do not mean the whole opportunity has expired.
            if (!opportunity.rowsByHistory.size) byOpportunity.delete(opportunityNumber);
        }
        if (byOpportunity.size) return byOpportunity;
        byStopId.delete(stopId);
        lastPruneMinuteByStopId.delete(stopId);
        return null;
    };

    const add = (stopId, label) => {
        if (!label.active || label.transferCount !== 1) return;
        let byOpportunity = byStopId.get(stopId);
        if (!byOpportunity) {
            byOpportunity = new Map();
            byStopId.set(stopId, byOpportunity);
        }
        let opportunity = byOpportunity.get(label.opportunityNumber);
        if (!opportunity) {
            opportunity = {
                deadlineMin: label.deadlineMin,
                rowsByHistory: new Map()
            };
            byOpportunity.set(label.opportunityNumber, opportunity);
        }
        let rows = opportunity.rowsByHistory.get(label.visitedGroups);
        if (!rows) {
            rows = [];
            opportunity.rowsByHistory.set(label.visitedGroups, rows);
        }
        if (!rows.length || rows[rows.length - 1].arrMin <= label.arrMin) rows.push(label);
        else rows.splice(upperBoundByArrival(rows, label.arrMin), 0, label);
    };

    const forEachBoardable = ({
        stopId,
        connection,
        minArrivalMinute,
        maxArrivalMinute,
        canSkipHistory,
        visit
    }) => {
        const byOpportunity = pruneExpiredAndInactive(stopId, connection.depMin);
        if (!byOpportunity) return;
        const checkForbiddenTrip = stopId === connection.fromStopId;
        const checkHistory = connection.toGroupKey !== connection.fromGroupKey;
        for (const [opportunityNumber, opportunity] of byOpportunity) {
            if (opportunity.deadlineMin < connection.depMin) {
                byOpportunity.delete(opportunityNumber);
                onExpire?.(stopId, opportunityNumber);
                continue;
            }
            if (opportunity.deadlineMin < connection.arrMin) continue;
            for (const [history, rows] of opportunity.rowsByHistory) {
                if (
                    !rows.length ||
                    rows[rows.length - 1].arrMin < minArrivalMinute ||
                    rows[0].arrMin > maxArrivalMinute
                ) continue;
                if (canSkipHistory?.(opportunityNumber, history)) continue;
                if (checkHistory && hasVisitedGroup(history, connection.toGroupKey)) continue;
                for (
                    let rowIndex = lowerBoundByArrival(rows, minArrivalMinute);
                    rowIndex < rows.length;
                    rowIndex += 1
                ) {
                    const state = rows[rowIndex];
                    if (state.arrMin > maxArrivalMinute) break;
                    if (!state.active) continue;
                    if (checkForbiddenTrip && state.forbiddenTripId === connection.tripId) continue;
                    visit(state, connection.fromGroupKey);
                    break;
                }
            }
        }
        if (!byOpportunity.size) {
            byStopId.delete(stopId);
            lastPruneMinuteByStopId.delete(stopId);
        }
    };

    return { add, forEachBoardable };
};

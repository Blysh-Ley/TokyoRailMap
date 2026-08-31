// Per-scan arrival storage. Frontiers and time indexes contain integer IDs;
// accepted arrivals occupy columns, and rejected arrivals allocate no record.
export const createCompactArrivalStore = ({
    opportunities,
    batchStart,
    maxWaitMinutes,
    maxTransferCount,
    isSubset,
    hasVisitedGroup,
    getOpportunityBit
}) => {
    let opportunityOffsets = new Uint32Array(0);
    let transferCounts = new Uint8Array(0);
    let arrivalMinutes = new Float64Array(0);
    const forbiddenTrips = [];
    const histories = [];
    let active = new Uint8Array(0);
    let nextId = 0;
    const freeIds = [];
    const opportunityBits = [];
    const byStopId = new Map();

    const growColumns = () => {
        const capacity = Math.max(256, active.length * 2);
        const nextOffsets = new Uint32Array(capacity);
        const nextTransfers = new Uint8Array(capacity);
        const nextArrivals = new Float64Array(capacity);
        const nextActive = new Uint8Array(capacity);
        nextOffsets.set(opportunityOffsets);
        nextTransfers.set(transferCounts);
        nextArrivals.set(arrivalMinutes);
        nextActive.set(active);
        opportunityOffsets = nextOffsets;
        transferCounts = nextTransfers;
        arrivalMinutes = nextArrivals;
        active = nextActive;
    };

    const opportunityNumberOf = (id) => opportunityOffsets[id] + batchStart;
    const deadlineOf = (number) => opportunities[number].deadlineMin;

    const lowerBound = (ids, minute) => {
        let low = 0;
        let high = ids.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (arrivalMinutes[ids[middle]] < minute) low = middle + 1;
            else high = middle;
        }
        return low;
    };
    const upperBound = (ids, minute) => {
        let low = 0;
        let high = ids.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (arrivalMinutes[ids[middle]] <= minute) low = middle + 1;
            else high = middle;
        }
        return low;
    };
    const insertByArrival = (ids, id) => {
        if (!ids.length || arrivalMinutes[ids[ids.length - 1]] <= arrivalMinutes[id]) ids.push(id);
        else ids.splice(upperBound(ids, arrivalMinutes[id]), 0, id);
    };
    const missesWindow = (ids, minimum, maximum) => (
        !ids.length || arrivalMinutes[ids[ids.length - 1]] < minimum || arrivalMinutes[ids[0]] > maximum
    );

    const getStop = (stopId) => {
        let stop = byStopId.get(stopId);
        if (!stop) {
            stop = {
                frontiers: new Map(),
                terminal: null,
                byHistory: null,
                roundZero: null,
                terminalPrune: null,
                historyPrune: null,
                roundZeroPrune: null
            };
            byStopId.set(stopId, stop);
        }
        return stop;
    };
    const release = (id) => {
        active[id] = false;
        forbiddenTrips[id] = null;
        histories[id] = 0n;
        freeIds.push(id);
    };
    const releaseRows = (ids) => {
        for (const id of ids) release(id);
        ids.length = 0;
    };
    const compactActiveRows = (ids) => {
        let kept = 0;
        for (const id of ids) {
            if (active[id]) ids[kept++] = id;
            else release(id);
        }
        ids.length = kept;
    };
    const removeEmptyStop = (stopId, stop) => {
        if (!stop.frontiers.size && !stop.terminal && !stop.byHistory && !stop.roundZero) byStopId.delete(stopId);
    };

    const add = (stopId, opportunityNumber, transferCount, arrMin, forbiddenTripId, visitedGroups) => {
        const stop = getStop(stopId);
        const deadlineMin = deadlineOf(opportunityNumber);
        let partitions = stop.frontiers.get(opportunityNumber);
        if (!partitions) {
            partitions = { earlyByArrival: null, lateRows: null };
            stop.frontiers.set(opportunityNumber, partitions);
        }
        let rows;
        if (arrMin + maxWaitMinutes < deadlineMin) {
            const early = partitions.earlyByArrival ??= new Map();
            if (!early.has(arrMin)) early.set(arrMin, []);
            rows = early.get(arrMin);
        } else {
            rows = partitions.lateRows ??= [];
        }

        if (transferCount === maxTransferCount - 1) {
            for (let position = rows.length - 1; position >= 0; position -= 1) {
                const id = rows[position];
                if (!active[id] || transferCounts[id] !== transferCount || arrivalMinutes[id] !== arrMin || forbiddenTrips[id] !== forbiddenTripId) continue;
                // The caller needs this merged history even when no new
                // record is accepted: a through continuation consumes it.
                visitedGroups &= histories[id];
                if (forbiddenTrips[id] != null && visitedGroups === histories[id]) return visitedGroups;
                active[id] = false;
                rows.splice(position, 1);
            }
        }
        for (let position = rows.length - 1; position >= 0; position -= 1) {
            const id = rows[position];
            if (!active[id] || arrivalMinutes[id] !== arrMin || transferCounts[id] !== transferCount || histories[id] !== visitedGroups) continue;
            if (forbiddenTrips[id] == null) return visitedGroups;
            if (forbiddenTripId == null) {
                active[id] = false;
                rows.splice(position, 1);
                continue;
            }
            if (forbiddenTrips[id] === forbiddenTripId) return visitedGroups;
            forbiddenTripId = null;
            active[id] = false;
            rows.splice(position, 1);
        }
        for (const id of rows) {
            if (
                active[id] &&
                (forbiddenTrips[id] == null || forbiddenTrips[id] === forbiddenTripId) &&
                arrivalMinutes[id] <= arrMin &&
                (arrivalMinutes[id] === arrMin || arrivalMinutes[id] + maxWaitMinutes >= deadlineMin) &&
                transferCounts[id] <= transferCount &&
                isSubset(histories[id], visitedGroups)
            ) return visitedGroups;
        }
        for (let position = rows.length - 1; position >= 0; position -= 1) {
            const id = rows[position];
            if (
                (forbiddenTripId == null || forbiddenTripId === forbiddenTrips[id]) &&
                arrMin <= arrivalMinutes[id] &&
                (arrMin === arrivalMinutes[id] || arrMin + maxWaitMinutes >= deadlineMin) &&
                transferCount <= transferCounts[id] &&
                isSubset(visitedGroups, histories[id])
            ) {
                active[id] = false;
                rows.splice(position, 1);
            }
        }

        const id = freeIds.length ? freeIds.pop() : nextId++;
        if (id === active.length) growColumns();
        opportunityOffsets[id] = opportunityNumber - batchStart;
        transferCounts[id] = transferCount;
        arrivalMinutes[id] = arrMin;
        forbiddenTrips[id] = forbiddenTripId;
        histories[id] = visitedGroups;
        active[id] = true;
        rows.push(id);
        if (transferCount === 1) {
            const byOpportunity = stop.byHistory ??= new Map();
            if (!byOpportunity.has(opportunityNumber)) byOpportunity.set(opportunityNumber, new Map());
            const byHistory = byOpportunity.get(opportunityNumber);
            if (!byHistory.has(visitedGroups)) byHistory.set(visitedGroups, []);
            insertByArrival(byHistory.get(visitedGroups), id);
        } else if (transferCount === maxTransferCount - 1) {
            const byOpportunity = stop.terminal ??= new Map();
            if (!byOpportunity.has(opportunityNumber)) byOpportunity.set(opportunityNumber, []);
            opportunityBits[opportunityNumber - batchStart] ??= getOpportunityBit(opportunityNumber);
            insertByArrival(byOpportunity.get(opportunityNumber), id);
        } else {
            insertByArrival(stop.roundZero ??= [], id);
        }
        return visitedGroups;
    };

    const pruneTerminal = (stop, currentMinute) => {
        if (!stop.terminal || (stop.terminalPrune !== null && currentMinute - stop.terminalPrune < 5)) return;
        stop.terminalPrune = currentMinute;
        for (const [number, ids] of stop.terminal) {
            if (deadlineOf(number) < currentMinute) {
                stop.frontiers.delete(number);
                releaseRows(ids);
            } else compactActiveRows(ids);
            if (!ids.length) stop.terminal.delete(number);
        }
        if (!stop.terminal.size) {
            stop.terminal = null;
            stop.terminalPrune = null;
        }
    };

    const findTerminalBoardableBits = ({ stopId, connection, minArrivalMinute, maxArrivalMinute, alreadyBoardedBits }) => {
        const stop = byStopId.get(stopId);
        if (!stop) return alreadyBoardedBits;
        pruneTerminal(stop, connection.depMin);
        let bits = alreadyBoardedBits;
        const checkForbiddenTrip = stopId === connection.fromStopId;
        const checkHistory = connection.toGroupKey !== connection.fromGroupKey;
        if (stop.terminal) {
            for (const [number, ids] of stop.terminal) {
                if (deadlineOf(number) < connection.depMin) {
                    stop.frontiers.delete(number);
                    releaseRows(ids);
                    stop.terminal.delete(number);
                    continue;
                }
                const bit = opportunityBits[number - batchStart];
                if ((bits & bit) !== 0n || deadlineOf(number) < connection.arrMin || missesWindow(ids, minArrivalMinute, maxArrivalMinute)) continue;
                for (let position = upperBound(ids, maxArrivalMinute) - 1; position >= 0; position -= 1) {
                    const id = ids[position];
                    if (arrivalMinutes[id] < minArrivalMinute) break;
                    if (!active[id]) continue;
                    if (checkForbiddenTrip && forbiddenTrips[id] === connection.tripId) continue;
                    if (checkHistory && hasVisitedGroup(histories[id], connection.toGroupKey)) continue;
                    bits |= bit;
                    break;
                }
            }
            if (!stop.terminal.size) {
                stop.terminal = null;
                stop.terminalPrune = null;
            }
        }
        removeEmptyStop(stopId, stop);
        return bits;
    };

    const pruneHistory = (stop, currentMinute) => {
        if (!stop.byHistory || (stop.historyPrune !== null && currentMinute - stop.historyPrune < 5)) return;
        stop.historyPrune = currentMinute;
        for (const [number, byHistory] of stop.byHistory) {
            if (deadlineOf(number) < currentMinute) {
                stop.frontiers.delete(number);
                for (const ids of byHistory.values()) releaseRows(ids);
                stop.byHistory.delete(number);
                continue;
            }
            for (const [history, ids] of byHistory) {
                compactActiveRows(ids);
                if (!ids.length) byHistory.delete(history);
            }
            if (!byHistory.size) stop.byHistory.delete(number);
        }
        if (!stop.byHistory.size) {
            stop.byHistory = null;
            stop.historyPrune = null;
        }
    };
    const pruneRoundZero = (stop, currentMinute) => {
        if (!stop.roundZero || (stop.roundZeroPrune !== null && currentMinute - stop.roundZeroPrune < 5)) return;
        stop.roundZeroPrune = currentMinute;
        const ids = stop.roundZero;
        let kept = 0;
        for (const id of ids) {
            const number = opportunityNumberOf(id);
            if (active[id] && deadlineOf(number) >= currentMinute) ids[kept++] = id;
            else {
                if (active[id]) stop.frontiers.delete(number);
                release(id);
            }
        }
        ids.length = kept;
        if (!ids.length) {
            stop.roundZero = null;
            stop.roundZeroPrune = null;
        }
    };

    const forEachBoardable = ({ stopId, connection, minArrivalMinute, maxArrivalMinute, canSkipHistory, visit }) => {
        const stop = byStopId.get(stopId);
        if (!stop) return;
        const checkForbiddenTrip = stopId === connection.fromStopId;
        const checkHistory = connection.toGroupKey !== connection.fromGroupKey;
        // Preserve source-local order: round one by history, then round zero
        // by arrival time. The caller invokes the terminal query before this.
        pruneHistory(stop, connection.depMin);
        if (stop.byHistory) {
            for (const [number, byHistory] of stop.byHistory) {
                if (deadlineOf(number) < connection.depMin) {
                    stop.frontiers.delete(number);
                    for (const ids of byHistory.values()) releaseRows(ids);
                    stop.byHistory.delete(number);
                    continue;
                }
                if (deadlineOf(number) < connection.arrMin) continue;
                for (const [history, ids] of byHistory) {
                    if (missesWindow(ids, minArrivalMinute, maxArrivalMinute)) continue;
                    if (canSkipHistory(number, history)) continue;
                    if (checkHistory && hasVisitedGroup(history, connection.toGroupKey)) continue;
                    for (let position = lowerBound(ids, minArrivalMinute); position < ids.length; position += 1) {
                        const id = ids[position];
                        if (arrivalMinutes[id] > maxArrivalMinute) break;
                        if (!active[id]) continue;
                        if (checkForbiddenTrip && forbiddenTrips[id] === connection.tripId) continue;
                        visit(number, 1, histories[id], connection.fromGroupKey);
                        break;
                    }
                }
            }
            if (!stop.byHistory.size) {
                stop.byHistory = null;
                stop.historyPrune = null;
            }
        }
        pruneRoundZero(stop, connection.depMin);
        const ids = stop.roundZero;
        if (ids && !missesWindow(ids, minArrivalMinute, maxArrivalMinute)) {
            const end = upperBound(ids, maxArrivalMinute);
            for (let position = lowerBound(ids, minArrivalMinute); position < end; position += 1) {
                const id = ids[position];
                const number = opportunityNumberOf(id);
                if (!active[id] || deadlineOf(number) < connection.arrMin) continue;
                if (checkForbiddenTrip && forbiddenTrips[id] === connection.tripId) continue;
                if (checkHistory && hasVisitedGroup(histories[id], connection.toGroupKey)) continue;
                visit(number, transferCounts[id], histories[id], connection.fromGroupKey);
            }
        }
        removeEmptyStop(stopId, stop);
    };

    return { add, findTerminalBoardableBits, forEachBoardable };
};

import {
    REACHABLE_STOPS_RULES,
    buildReachableStopsOpportunityMeta,
    getReachableStopsPlanningBudgetMinutes
} from './rules.js';
import { createTerminalTransferIndex } from './terminalTransferIndex.js';
import { createTransferHistoryIndex } from './transferHistoryIndex.js';
import { createCompactArrivalStore } from './compactArrivalStore.js';

const normalizeText = (value) => String(value ?? '').trim();

const createAbortError = (signal) => {
    if (signal?.reason instanceof Error) return signal.reason;
    const error = new Error('Reachable-stops opportunity scan was aborted');
    error.name = 'AbortError';
    return error;
};

const throwIfAborted = (signal) => {
    if (signal?.aborted) throw createAbortError(signal);
};

const createVisitedGroupHistoryRegistry = () => {
    const groupBitByKey = new Map();
    const terminalVisitedGroups = 0n;

    const getGroupBit = (groupKey) => {
        const key = normalizeText(groupKey);
        let bit = groupBitByKey.get(key);
        if (bit === undefined) {
            bit = 1n << BigInt(groupBitByKey.size);
            groupBitByKey.set(key, bit);
        }
        return bit;
    };

    const hasVisitedGroup = (history, groupKey) => {
        const source = history || 0n;
        if (!source) return false;
        const bit = groupBitByKey.get(normalizeText(groupKey));
        return bit !== undefined && (source & bit) !== 0n;
    };

    const isSubset = (candidateSubset, candidateSuperset) => {
        const subsetMask = candidateSubset || 0n;
        const supersetMask = candidateSuperset || 0n;
        return (subsetMask & supersetMask) === subsetMask;
    };

    const addGroups = (source, ...groupKeys) => {
        let history = source || 0n;
        for (const groupKey of groupKeys) {
            const key = normalizeText(groupKey);
            if (key) history |= getGroupBit(key);
        }
        return history;
    };

    return { hasVisitedGroup, isSubset, addGroups, getGroupBit, terminalVisitedGroups };
};

const lowerBoundByArrival = (rows, targetMinute) => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (rows[mid].arrMin < targetMinute) low = mid + 1;
        else high = mid;
    }
    return low;
};

const upperBoundByArrival = (rows, targetMinute) => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (rows[mid].arrMin <= targetMinute) low = mid + 1;
        else high = mid;
    }
    return low;
};

const lowerBoundByDeparture = (rows, targetMinute) => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (rows[mid].depMin < targetMinute) low = mid + 1;
        else high = mid;
    }
    return low;
};

const upperBoundByDeparture = (rows, targetMinute) => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (rows[mid].depMin <= targetMinute) low = mid + 1;
        else high = mid;
    }
    return low;
};

const insertByArrival = (rows, label) => {
    const index = upperBoundByArrival(rows, label.arrMin);
    rows.splice(index, 0, label);
};

const normalizeSourceWalkMinutes = ({ originStationId, sourceStops }) => {
    const originId = normalizeText(originStationId);
    const result = new Map();
    const add = (stopId, walkMinutes) => {
        const id = normalizeText(stopId);
        const minutes = Number(walkMinutes);
        if (!id || !Number.isFinite(minutes) || minutes < 0) return;
        const previous = result.get(id);
        if (!Number.isFinite(previous) || minutes < previous) result.set(id, minutes);
    };

    if (sourceStops instanceof Map) {
        for (const [stopId, walkMinutes] of sourceStops.entries()) add(stopId, walkMinutes);
    } else if (Array.isArray(sourceStops) || sourceStops instanceof Set) {
        for (const row of sourceStops) {
            if (typeof row === 'string') add(row, row === originId ? 0 : 0);
            else add(row?.stopId, row?.walkMinutes ?? row?.penaltyMin ?? 0);
        }
    }
    if (originId && !result.has(originId)) result.set(originId, 0);
    return result;
};

const minuteKey = (minute) => {
    const value = Number(minute);
    return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
};

const buildStartOpportunities = ({
    index,
    originStationId,
    sourceWalkMinutes,
    planningBudgetMinutes,
    signal
}) => {
    const originId = normalizeText(originStationId);
    const originGroupKey = index.groupKeyByStop.get(originId) || originId;
    const opportunityById = new Map();
    const opportunityByNumber = [];
    const opportunityNumberByConnectionId = new Map();

    let inspected = 0;
    for (const connection of index.connections) {
        inspected += 1;
        if ((inspected & 2047) === 0) throwIfAborted(signal);
        const walkMinutes = sourceWalkMinutes.get(connection.fromStopId);
        if (!Number.isFinite(walkMinutes)) continue;
        if (planningBudgetMinutes - walkMinutes < 0) continue;

        const opportunityId = [
            index.serviceDay,
            connection.throughComponentId,
            originGroupKey,
            minuteKey(connection.depMin)
        ].join('|');
        let opportunity = opportunityById.get(opportunityId);
        if (!opportunity) {
            opportunity = {
                opportunityId,
                opportunityNumber: opportunityByNumber.length,
                boardingDepMin: connection.depMin,
                originWalkMinutes: walkMinutes,
                deadlineMin: connection.depMin + planningBudgetMinutes - walkMinutes
            };
            opportunityById.set(opportunityId, opportunity);
            opportunityByNumber.push(opportunity);
        } else if (walkMinutes < opportunity.originWalkMinutes) {
            opportunity.originWalkMinutes = walkMinutes;
            opportunity.deadlineMin = connection.depMin + planningBudgetMinutes - walkMinutes;
        }
        opportunityNumberByConnectionId.set(connection.id, opportunity.opportunityNumber);
    }

    return { opportunityById, opportunityByNumber, opportunityNumberByConnectionId };
};

const buildEmptyResult = ({ minutes, serviceDay }) => ({
    reachableStops: [],
    remainingMsByStop: new Map(),
    meta: buildReachableStopsOpportunityMeta({ minutes, serviceDay })
});

export const scanReachableStopsByDepartureOpportunity = async ({
    index,
    originStationId,
    minutes,
    sourceStops = null,
    signal = null,
    opportunityBatchSize = 64,
    opportunityPartitionIndex = 0,
    opportunityPartitionCount = 1,
    yieldEveryConnections = 4096,
    yieldControl = null,
    optimizeTransferChecks = false,
    groupEquivalentStates = false
} = {}) => {
    throwIfAborted(signal);
    const originId = normalizeText(originStationId);
    const requestedMinutes = Number(minutes);
    const serviceDay = normalizeText(index?.serviceDay) || 'Weekday';
    const planningBudgetMinutes = getReachableStopsPlanningBudgetMinutes(requestedMinutes);
    if (
        !index ||
        !originId ||
        !Number.isFinite(requestedMinutes) ||
        requestedMinutes < 0 ||
        !Number.isFinite(planningBudgetMinutes)
    ) {
        return buildEmptyResult({ minutes: requestedMinutes, serviceDay });
    }

    const sourceWalkMinutes = normalizeSourceWalkMinutes({
        originStationId: originId,
        sourceStops
    });
    const { opportunityById, opportunityByNumber, opportunityNumberByConnectionId } = buildStartOpportunities({
        index,
        originStationId: originId,
        sourceWalkMinutes,
        planningBudgetMinutes,
        signal
    });
    if (!opportunityById.size) {
        return buildEmptyResult({ minutes: requestedMinutes, serviceDay });
    }

    const bestRemainingBucketByGroup = new Map();
    const bucketSizeMinutes = Math.max(
        1,
        planningBudgetMinutes / REACHABLE_STOPS_RULES.bucketCount
    );
    const batchSize = Math.max(1, Math.floor(Number(opportunityBatchSize) || 64));
    const useGroupedStates = optimizeTransferChecks && groupEquivalentStates;

    for (
        let batchStart = opportunityPartitionIndex * batchSize;
        batchStart < opportunityByNumber.length;
        batchStart += batchSize * opportunityPartitionCount
    ) {
        throwIfAborted(signal);
        const batchEnd = Math.min(opportunityByNumber.length, batchStart + batchSize);
        let earliestBoardingMinute = Infinity;
        let latestDeadlineMinute = -Infinity;
        for (let opportunityNumber = batchStart; opportunityNumber < batchEnd; opportunityNumber += 1) {
            const opportunity = opportunityByNumber[opportunityNumber];
            earliestBoardingMinute = Math.min(earliestBoardingMinute, opportunity.boardingDepMin);
            latestDeadlineMinute = Math.max(latestDeadlineMinute, opportunity.deadlineMin);
        }
        const connectionStartIndex = lowerBoundByDeparture(index.connections, earliestBoardingMinute);
        const connectionEndIndex = upperBoundByDeparture(index.connections, latestDeadlineMinute);

        const onboardByTripId = new Map();
        const arrivalsByStopId = new Map();
        const arrivalFrontierByStopId = new Map();
        const lastArrivalPruneMinuteByStopId = new Map();
        const {
            hasVisitedGroup,
            isSubset: compareSubset,
            addGroups,
            getGroupBit,
            terminalVisitedGroups
        } = createVisitedGroupHistoryRegistry();
        const isSubset = optimizeTransferChecks
            ? (subset, superset) => subset === superset || compareSubset(subset, superset)
            : compareSubset;
        const compactArrivals = useGroupedStates
            ? createCompactArrivalStore({
                opportunities: opportunityByNumber,
                batchStart,
                maxWaitMinutes: REACHABLE_STOPS_RULES.maxWaitMinutes,
                maxTransferCount: REACHABLE_STOPS_RULES.maxTransferCount,
                isSubset,
                hasVisitedGroup,
                getOpportunityBit: (opportunityNumber) => getTerminalOpportunityBit(opportunityNumber)
            })
            : null;
        const terminalTransferIndex = optimizeTransferChecks && !useGroupedStates
            ? createTerminalTransferIndex({
                getOpportunityBit: (opportunityNumber) => getTerminalOpportunityBit(opportunityNumber),
                hasVisitedGroup,
                onExpire: (stopId, opportunityNumber) => arrivalFrontierByStopId.get(stopId)?.delete(opportunityNumber)
            })
            : null;
        const transferHistoryIndex = optimizeTransferChecks && !useGroupedStates
            ? createTransferHistoryIndex({
                hasVisitedGroup,
                onExpire: (stopId, opportunityNumber) => arrivalFrontierByStopId.get(stopId)?.delete(opportunityNumber)
            })
            : null;

    const getOnboardBuckets = (tripId) => {
        if (!onboardByTripId.has(tripId)) onboardByTripId.set(tripId, new Map());
        return onboardByTripId.get(tripId);
    };

    const onboardFrontierKey = (label) => label.opportunityNumber;

    const addOnboardLabel = (tripId, label, knownTrip = null) => {
        const trip = knownTrip || index.tripById.get(tripId);
        const nextDepartureMinute = trip?.stops?.[label.nextIndex]?.depMin;
        const nextArrivalMinute = trip?.stops?.[label.nextIndex + 1]?.arrMin;
        if (Number.isFinite(nextArrivalMinute) && nextArrivalMinute > label.deadlineMin) return false;
        if (Number.isFinite(nextDepartureMinute) && Number.isFinite(label.lastArrMin)) {
            const dwellMinutes = nextDepartureMinute - label.lastArrMin;
            if (dwellMinutes < 0 || dwellMinutes > REACHABLE_STOPS_RULES.maxWaitMinutes) return false;
        }
        if (optimizeTransferChecks && Number.isFinite(nextDepartureMinute) && Number.isFinite(nextArrivalMinute)) {
            // Boarding legality was checked above. Every admitted label now
            // takes the same fixed leg; its previous arrival time no longer
            // distinguishes future rides, waits, or transfer permissions.
            label.lastArrMin = nextDepartureMinute;
        }

        const buckets = getOnboardBuckets(tripId);
        if (!buckets.has(label.nextIndex)) buckets.set(label.nextIndex, new Map());
        const frontier = buckets.get(label.nextIndex);
        const key = onboardFrontierKey(label);
        if (!frontier.has(key)) frontier.set(key, []);
        let rows = frontier.get(key);
        if (typeof rows === 'bigint') {
            if (
                label.transferCount <= REACHABLE_STOPS_RULES.maxTransferCount - 1 &&
                label.lastArrMin >= nextDepartureMinute &&
                isSubset(label.visitedGroups, rows)
            ) {
                frontier.set(key, [label]);
                return true;
            }
            rows = [{
                opportunityNumber: key,
                deadlineMin: opportunityByNumber[key].deadlineMin,
                transferCount: REACHABLE_STOPS_RULES.maxTransferCount - 1,
                lastArrMin: nextDepartureMinute,
                nextIndex: label.nextIndex,
                visitedGroups: rows
            }];
            frontier.set(key, rows);
        }
        if (label.transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
            for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
                const existing = rows[rowIndex];
                if (
                    existing.transferCount !== label.transferCount ||
                    existing.lastArrMin !== label.lastArrMin
                ) continue;
                if (optimizeTransferChecks && isSubset(existing.visitedGroups, label.visitedGroups)) return false;
                label.visitedGroups &= existing.visitedGroups;
                rows.splice(rowIndex, 1);
            }
        }
        for (const existing of rows) {
            if (
                existing.transferCount <= label.transferCount &&
                existing.lastArrMin >= label.lastArrMin &&
                isSubset(existing.visitedGroups, label.visitedGroups)
            ) {
                return false;
            }
        }
        for (let indexOfRow = rows.length - 1; indexOfRow >= 0; indexOfRow -= 1) {
            const existing = rows[indexOfRow];
            if (
                label.transferCount <= existing.transferCount &&
                label.lastArrMin >= existing.lastArrMin &&
                isSubset(label.visitedGroups, existing.visitedGroups)
            ) {
                rows.splice(indexOfRow, 1);
            }
        }
        rows.push(label);
        return true;
    };

    const addRoundTwoBoardingMember = (frontier, fixedLeg, tripId, trip, nextIndex, lastArrMin, visitedGroups, opportunityNumber) => {
        const rows = frontier.get(opportunityNumber);
        if (fixedLeg && (rows === undefined || typeof rows === 'bigint')) {
            frontier.set(opportunityNumber, rows === undefined ? visitedGroups : rows & visitedGroups);
        } else {
            addOnboardLabel(tripId, {
                opportunityNumber,
                deadlineMin: opportunityByNumber[opportunityNumber].deadlineMin,
                transferCount: REACHABLE_STOPS_RULES.maxTransferCount - 1,
                lastArrMin,
                nextIndex,
                visitedGroups
            }, trip);
        }
    };

    // Members share a fixed leg and history, but keep their own deadline.
    // A lone round-two state needs only its history; materialize a label only
    // when another transfer round must coexist at the same trip position.
    const addGroupedRoundTwoBoarding = (tripId, nextIndex, lastArrMin, visitedGroups, members, knownTrip = null) => {
        const trip = knownTrip || index.tripById.get(tripId);
        const nextDepartureMinute = trip?.stops?.[nextIndex]?.depMin;
        const nextArrivalMinute = trip?.stops?.[nextIndex + 1]?.arrMin;
        const singleMember = typeof members === 'number';
        let bits = singleMember ? 0n : members;
        if (Number.isFinite(nextArrivalMinute)) {
            if (singleMember) {
                if (opportunityByNumber[members].deadlineMin < nextArrivalMinute) return;
            } else bits &= getTerminalDeadlineMask(nextArrivalMinute);
        }
        if (!singleMember && !bits) return;
        if (Number.isFinite(nextDepartureMinute) && Number.isFinite(lastArrMin)) {
            const dwellMinutes = nextDepartureMinute - lastArrMin;
            if (dwellMinutes < 0 || dwellMinutes > REACHABLE_STOPS_RULES.maxWaitMinutes) return;
        }
        const fixedLeg = Number.isFinite(nextDepartureMinute) && Number.isFinite(nextArrivalMinute);
        const buckets = getOnboardBuckets(tripId);
        if (!buckets.has(nextIndex)) buckets.set(nextIndex, new Map());
        const frontier = buckets.get(nextIndex);
        if (singleMember) {
            addRoundTwoBoardingMember(frontier, fixedLeg, tripId, trip, nextIndex, lastArrMin, visitedGroups, members);
            return;
        }
        let offset = batchStart;
        while (bits) {
            let word = Number(bits & 0xffffffffn);
            while (word) {
                const opportunityNumber = offset + 31 - Math.clz32(word & -word);
                addRoundTwoBoardingMember(frontier, fixedLeg, tripId, trip, nextIndex, lastArrMin, visitedGroups, opportunityNumber);
                word &= word - 1;
            }
            bits >>= 32n;
            offset += 32;
        }
    };

    const getArrivalFrontier = (stopId) => {
        if (!arrivalFrontierByStopId.has(stopId)) arrivalFrontierByStopId.set(stopId, new Map());
        return arrivalFrontierByStopId.get(stopId);
    };

    const arrivalHasPermissionSuperset = (candidate, other) => (
        candidate.forbiddenTripId == null ||
        candidate.forbiddenTripId === other.forbiddenTripId
    );

    const arrivalDominates = (candidate, other) => (
        candidate.active &&
        arrivalHasPermissionSuperset(candidate, other) &&
        candidate.arrMin <= other.arrMin &&
        (
            candidate.arrMin === other.arrMin ||
            candidate.arrMin + REACHABLE_STOPS_RULES.maxWaitMinutes >= candidate.deadlineMin
        ) &&
        candidate.transferCount <= other.transferCount &&
        isSubset(candidate.visitedGroups, other.visitedGroups)
    );

    const addArrivalLabel = (stopId, label) => {
        const frontier = getArrivalFrontier(stopId);
        const key = label.opportunityNumber;
        let rows;
        if (optimizeTransferChecks) {
            if (!frontier.has(key)) frontier.set(key, { earlyByArrival: null, lateRows: null });
            const partitions = frontier.get(key);
            // Before this cutoff, only equal arrival times can dominate or
            // merge. A later partition cannot dominate an earlier arrival.
            if (label.arrMin + REACHABLE_STOPS_RULES.maxWaitMinutes < label.deadlineMin) {
                const earlyByArrival = partitions.earlyByArrival ??= new Map();
                if (!earlyByArrival.has(label.arrMin)) earlyByArrival.set(label.arrMin, []);
                rows = earlyByArrival.get(label.arrMin);
            } else {
                rows = partitions.lateRows ??= [];
            }
        } else {
            if (!frontier.has(key)) frontier.set(key, []);
            rows = frontier.get(key);
        }
        if (label.transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
            for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
                const existing = rows[rowIndex];
                if (
                    !existing.active ||
                    existing.transferCount !== label.transferCount ||
                    existing.arrMin !== label.arrMin ||
                    existing.forbiddenTripId !== label.forbiddenTripId
                ) continue;
                // Keep this mutation even for an equivalent frontier state:
                // through continuations consume the merged arrival history.
                label.visitedGroups &= existing.visitedGroups;
                if (
                    optimizeTransferChecks && existing.forbiddenTripId != null &&
                    label.visitedGroups === existing.visitedGroups
                ) return false;
                existing.active = false;
                rows.splice(rowIndex, 1);
            }
        }
        for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
            const existing = rows[rowIndex];
            const sameState = (
                existing.active &&
                existing.arrMin === label.arrMin &&
                existing.transferCount === label.transferCount &&
                existing.visitedGroups === label.visitedGroups
            );
            if (!sameState) continue;
            if (existing.forbiddenTripId == null) return false;
            if (label.forbiddenTripId == null) {
                existing.active = false;
                rows.splice(rowIndex, 1);
                continue;
            }
            if (existing.forbiddenTripId === label.forbiddenTripId) return false;
            label.forbiddenTripId = null;
            existing.active = false;
            rows.splice(rowIndex, 1);
        }
        for (const existing of rows) {
            if (arrivalDominates(existing, label)) return false;
        }
        for (let indexOfRow = rows.length - 1; indexOfRow >= 0; indexOfRow -= 1) {
            const existing = rows[indexOfRow];
            if (arrivalDominates(label, existing)) {
                existing.active = false;
                rows.splice(indexOfRow, 1);
            }
        }
        // The optimized queues already key labels by opportunityNumber; avoid
        // adding a redundant property (and changing every label's shape).
        if (!optimizeTransferChecks) label.frontierKey = key;
        rows.push(label);
        if (transferHistoryIndex && label.transferCount === 1) {
            transferHistoryIndex.add(stopId, label);
        } else if (terminalTransferIndex && label.transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
            terminalTransferIndex.add(stopId, label);
        } else {
            if (!arrivalsByStopId.has(stopId)) arrivalsByStopId.set(stopId, []);
            insertByArrival(arrivalsByStopId.get(stopId), label);
        }
        return true;
    };

    const recordReachableGroup = (groupKey, opportunityNumber, remainingMinutes) => {
        if (!Number.isFinite(remainingMinutes) || remainingMinutes < 0) return;
        let byOpportunity = bestRemainingBucketByGroup.get(groupKey);
        if (!byOpportunity) {
            byOpportunity = new Uint8Array(opportunityByNumber.length);
            bestRemainingBucketByGroup.set(groupKey, byOpportunity);
        }
        const bucket = Math.floor((remainingMinutes + Number.EPSILON) / bucketSizeMinutes);
        const encodedBucket = bucket + 1;
        if (encodedBucket > byOpportunity[opportunityNumber]) {
            byOpportunity[opportunityNumber] = encodedBucket;
        }
    };

    const terminalRideSeenBitsByConnectionIndex = new Map();
    const terminalDeadlineMaskByArrivalMinute = new Map();
    let terminalAbortCheckCounter = 0;
    const groupedOpportunityBits = useGroupedStates
        ? Array.from({ length: batchEnd - batchStart }, (_, number) => 1n << BigInt(number))
        : null;

    const getTerminalOpportunityBit = (opportunityNumber) => (
        groupedOpportunityBits
            ? groupedOpportunityBits[opportunityNumber - batchStart]
            : 1n << BigInt(opportunityNumber - batchStart)
    );

    const addOpportunityToGroup = (groups, history, opportunityNumber) => {
        const members = groups.get(history);
        if (members === undefined) groups.set(history, opportunityNumber);
        else if (typeof members === 'number') {
            groups.set(history, getTerminalOpportunityBit(members) | getTerminalOpportunityBit(opportunityNumber));
        } else groups.set(history, members | getTerminalOpportunityBit(opportunityNumber));
    };

    const getTerminalDeadlineMask = (arrivalMinute) => {
        if (terminalDeadlineMaskByArrivalMinute.has(arrivalMinute)) {
            return terminalDeadlineMaskByArrivalMinute.get(arrivalMinute);
        }
        let mask = 0n;
        for (let opportunityNumber = batchStart; opportunityNumber < batchEnd; opportunityNumber += 1) {
            if (opportunityByNumber[opportunityNumber].deadlineMin >= arrivalMinute) {
                mask |= getTerminalOpportunityBit(opportunityNumber);
            }
        }
        terminalDeadlineMaskByArrivalMinute.set(arrivalMinute, mask);
        return mask;
    };

    const recordReachableGroupBits = ({ groupKey, opportunityBits, arrivalMinute }) => {
        let bits = opportunityBits;
        let offset = batchStart;
        while (bits) {
            let word = Number(bits & 0xffffffffn);
            while (word) {
                const opportunityNumber = offset + 31 - Math.clz32(word & -word);
                const opportunity = opportunityByNumber[opportunityNumber];
                recordReachableGroup(groupKey, opportunityNumber, opportunity.deadlineMin - arrivalMinute);
                word &= word - 1;
            }
            bits >>= 32n;
            offset += 32;
        }
    };

    const recordTerminalRide = ({ connection, opportunityBits }) => {
        const stack = [{
            tripId: connection.tripId,
            entryIndex: connection.fromIndex,
            lastArrMin: connection.depMin,
            opportunityBits
        }];
        while (stack.length) {
            const state = stack.pop();
            const tripConnections = index.connectionsByTripId.get(state.tripId) || [];
            let lastArrMin = state.lastArrMin;
            let activeBits = state.opportunityBits;
            let finalConnection = null;
            for (let fromIndex = state.entryIndex; fromIndex < tripConnections.length; fromIndex += 1) {
                const rideConnection = tripConnections[fromIndex];
                if (!rideConnection) break;
                const dwellMinutes = rideConnection.depMin - lastArrMin;
                if (
                    dwellMinutes < 0 ||
                    dwellMinutes > REACHABLE_STOPS_RULES.maxWaitMinutes
                ) break;

                activeBits &= getTerminalDeadlineMask(rideConnection.arrMin);
                if (!activeBits) break;
                const seenBits = terminalRideSeenBitsByConnectionIndex.get(rideConnection.scanIndex) || 0n;
                activeBits &= ~seenBits;
                if (!activeBits) {
                    break;
                }
                terminalRideSeenBitsByConnectionIndex.set(
                    rideConnection.scanIndex,
                    seenBits | activeBits
                );

                recordReachableGroupBits({
                    groupKey: rideConnection.toGroupKey,
                    opportunityBits: activeBits,
                    arrivalMinute: rideConnection.arrMin
                });
                terminalAbortCheckCounter += 1;
                if ((terminalAbortCheckCounter & 2047) === 0) throwIfAborted(signal);
                lastArrMin = rideConnection.arrMin;
                finalConnection = rideConnection;
            }

            const trip = index.tripById.get(state.tripId);
            if (!activeBits || !trip || finalConnection?.toIndex !== trip.stops.length - 1) continue;
            for (const edge of index.throughEdgesFromTripId.get(state.tripId) || []) {
                const targetConnection = index.connectionsByTripId.get(edge.targetTripId)?.[edge.targetEntryIndex];
                if (!targetConnection) continue;
                stack.push({
                    tripId: edge.targetTripId,
                    entryIndex: edge.targetEntryIndex,
                    lastArrMin,
                    opportunityBits: activeBits
                });
            }
        }
    };
    const pruneExpiredArrivals = (stopId, currentMinute) => {
        const previousPruneMinute = lastArrivalPruneMinuteByStopId.get(stopId);
        if (Number.isFinite(previousPruneMinute) && currentMinute - previousPruneMinute < 5) return;
        lastArrivalPruneMinuteByStopId.set(stopId, currentMinute);
        const rows = arrivalsByStopId.get(stopId);
        if (!rows?.length) return;

        let changed = false;
        const activeRows = [];
        const frontier = arrivalFrontierByStopId.get(stopId);
        for (const state of rows) {
            if (state.active && state.deadlineMin >= currentMinute) {
                activeRows.push(state);
            } else {
                if (state.active) {
                    state.active = false;
                    frontier?.delete(optimizeTransferChecks ? state.opportunityNumber : state.frontierKey);
                }
                changed = true;
            }
        }
        if (!changed) return;
        arrivalsByStopId.set(stopId, activeRows);
    };

    const queryArrivalWindow = ({ stopId, minArrivalMinute, maxArrivalMinute, currentMinute }) => {
        pruneExpiredArrivals(stopId, currentMinute);
        const rows = arrivalsByStopId.get(stopId) || [];
        const start = lowerBoundByArrival(rows, minArrivalMinute);
        const end = upperBoundByArrival(rows, maxArrivalMinute);
        return { rows, start, end };
    };

    const addStartBoarding = (connection, knownTrip = null) => {
        const opportunityNumber = opportunityNumberByConnectionId.get(connection.id);
        if (
            !Number.isInteger(opportunityNumber) ||
            opportunityNumber < batchStart ||
            opportunityNumber >= batchEnd
        ) return;
        const opportunity = opportunityByNumber[opportunityNumber];
        if (!opportunity || connection.arrMin > opportunity.deadlineMin) return;
        addOnboardLabel(connection.tripId, {
            opportunityNumber,
            deadlineMin: opportunity.deadlineMin,
            transferCount: 0,
            lastArrMin: connection.depMin,
            nextIndex: connection.fromIndex,
            visitedGroups: addGroups(null, index.groupKeyByStop.get(originId) || originId, connection.fromGroupKey)
        }, knownTrip);
    };

    const transferCandidateRowsByOpportunity = new Array(opportunityByNumber.length);
    const transferRound2CandidateByOpportunity = optimizeTransferChecks
        ? new Array(opportunityByNumber.length)
        : null;
    const touchedTransferOpportunityNumbers = [];
    let transferFromGroupBit = null;
    const canSkipTransferHistory = (opportunityNumber, history) => {
        const candidate = transferRound2CandidateByOpportunity?.[opportunityNumber];
        return typeof candidate === 'bigint'
            ? isSubset(candidate, history)
            : candidate && isSubset(candidate.visitedGroups, history);
    };

    const addTransferCandidateValues = (opportunityNumber, previousTransferCount, previousVisitedGroups, fromGroupKey) => {
        const transferCount = previousTransferCount + 1;
        const visitedGroups = transferCount >= REACHABLE_STOPS_RULES.maxTransferCount
            ? terminalVisitedGroups
            : optimizeTransferChecks
                ? previousVisitedGroups | (transferFromGroupBit ??= getGroupBit(fromGroupKey))
                : addGroups(previousVisitedGroups, fromGroupKey);
        let rows = transferCandidateRowsByOpportunity[opportunityNumber];
        if (rows == null) {
            touchedTransferOpportunityNumbers.push(opportunityNumber);
            if (useGroupedStates && transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
                transferCandidateRowsByOpportunity[opportunityNumber] = visitedGroups;
                transferRound2CandidateByOpportunity[opportunityNumber] = visitedGroups;
                return;
            }
            rows = [];
            transferCandidateRowsByOpportunity[opportunityNumber] = rows;
        } else if (typeof rows === 'bigint') {
            if (transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
                const merged = rows & visitedGroups;
                transferCandidateRowsByOpportunity[opportunityNumber] = merged;
                transferRound2CandidateByOpportunity[opportunityNumber] = merged;
                return;
            }
            if (transferCount < REACHABLE_STOPS_RULES.maxTransferCount - 1 && isSubset(visitedGroups, rows)) {
                rows = [];
                transferRound2CandidateByOpportunity[opportunityNumber] = null;
            } else {
                const previous = {
                    opportunityNumber,
                    deadlineMin: opportunityByNumber[opportunityNumber].deadlineMin,
                    transferCount: REACHABLE_STOPS_RULES.maxTransferCount - 1,
                    visitedGroups: rows
                };
                rows = [previous];
                transferRound2CandidateByOpportunity[opportunityNumber] = previous;
            }
            transferCandidateRowsByOpportunity[opportunityNumber] = rows;
        }
        if (transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
            const sameRoundCandidate = transferRound2CandidateByOpportunity
                ? transferRound2CandidateByOpportunity[opportunityNumber]
                : rows.find((candidate) => candidate.transferCount === transferCount);
            if (sameRoundCandidate) {
                sameRoundCandidate.visitedGroups &= visitedGroups;
                return;
            }
        }
        for (const existing of rows) {
            if (
                existing.transferCount <= transferCount &&
                isSubset(existing.visitedGroups, visitedGroups)
            ) {
                return;
            }
        }
        for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
            const existing = rows[rowIndex];
            if (
                transferCount <= existing.transferCount &&
                isSubset(visitedGroups, existing.visitedGroups)
            ) {
                if (transferRound2CandidateByOpportunity?.[opportunityNumber] === existing) {
                    transferRound2CandidateByOpportunity[opportunityNumber] = null;
                }
                rows.splice(rowIndex, 1);
            }
        }
        const candidate = {
            opportunityNumber,
            deadlineMin: opportunityByNumber[opportunityNumber].deadlineMin,
            transferCount,
            visitedGroups
        };
        rows.push(candidate);
        if (transferRound2CandidateByOpportunity && transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
            transferRound2CandidateByOpportunity[opportunityNumber] = candidate;
        }
    };

    const addNondominatedTransferCandidate = (state, fromGroupKey) => (
        addTransferCandidateValues(state.opportunityNumber, state.transferCount, state.visitedGroups, fromGroupKey)
    );

    const addOrdinaryTransferBoardings = (connection, knownTrip = null) => {
        const transferSources = index.transferSourcesByTargetStop.get(connection.fromStopId) || [
            { stopId: connection.fromStopId, penaltyMin: 0 }
        ];
        touchedTransferOpportunityNumbers.length = 0;
        transferFromGroupBit = null;
        const completedTerminalBits = optimizeTransferChecks
            ? terminalRideSeenBitsByConnectionIndex.get(connection.scanIndex) || 0n
            : 0n;
        let terminalOpportunityBits = completedTerminalBits;
        for (const transferSource of transferSources) {
            if (!compactArrivals && !terminalTransferIndex && !arrivalsByStopId.has(transferSource.stopId)) continue;
            const penaltyMin = Number(transferSource.penaltyMin);
            if (!Number.isFinite(penaltyMin) || penaltyMin < 0) continue;
            const maxArrivalMinute = connection.depMin - penaltyMin;
            const minArrivalMinute = maxArrivalMinute - REACHABLE_STOPS_RULES.maxWaitMinutes;
            if (compactArrivals) {
                terminalOpportunityBits = compactArrivals.findTerminalBoardableBits({
                    stopId: transferSource.stopId,
                    connection,
                    minArrivalMinute,
                    maxArrivalMinute,
                    alreadyBoardedBits: terminalOpportunityBits
                });
                compactArrivals.forEachBoardable({
                    stopId: transferSource.stopId,
                    connection,
                    minArrivalMinute,
                    maxArrivalMinute,
                    canSkipHistory: canSkipTransferHistory,
                    visit: addTransferCandidateValues
                });
                continue;
            }
            if (terminalTransferIndex) {
                terminalOpportunityBits = terminalTransferIndex.findBoardableBits({
                    stopId: transferSource.stopId,
                    connection,
                    minArrivalMinute,
                    maxArrivalMinute,
                    alreadyBoardedBits: terminalOpportunityBits
                });
            }
            if (transferHistoryIndex) {
                transferHistoryIndex.forEachBoardable({
                    stopId: transferSource.stopId,
                    connection,
                    minArrivalMinute,
                    maxArrivalMinute,
                    canSkipHistory: canSkipTransferHistory,
                    visit: addNondominatedTransferCandidate
                });
            }
            if (!arrivalsByStopId.has(transferSource.stopId)) continue;
            const arrivalWindow = queryArrivalWindow({
                stopId: transferSource.stopId,
                minArrivalMinute,
                maxArrivalMinute,
                currentMinute: connection.depMin
            });
            for (let candidateIndex = arrivalWindow.start; candidateIndex < arrivalWindow.end; candidateIndex += 1) {
                const state = arrivalWindow.rows[candidateIndex];
                if (!state.active || state.deadlineMin < connection.arrMin) continue;
                if (state.forbiddenTripId === connection.tripId && transferSource.stopId === connection.fromStopId) {
                    continue;
                }
                if (state.transferCount >= REACHABLE_STOPS_RULES.maxTransferCount) continue;
                if (
                    connection.toGroupKey !== connection.fromGroupKey &&
                    hasVisitedGroup(state.visitedGroups, connection.toGroupKey)
                ) {
                    continue;
                }
                if (state.transferCount + 1 >= REACHABLE_STOPS_RULES.maxTransferCount) {
                    terminalOpportunityBits |= getTerminalOpportunityBit(state.opportunityNumber);
                    continue;
                }
                addNondominatedTransferCandidate(state, connection.fromGroupKey);
            }
        }
        let groupedBoardings = null;
        for (const opportunityNumber of touchedTransferOpportunityNumbers) {
            const rows = transferCandidateRowsByOpportunity[opportunityNumber];
            if (typeof rows === 'bigint') {
                if (touchedTransferOpportunityNumbers.length === 1) {
                    addGroupedRoundTwoBoarding(connection.tripId, connection.fromIndex, connection.depMin,
                        rows, opportunityNumber, knownTrip);
                } else {
                    groupedBoardings ??= new Map();
                    addOpportunityToGroup(groupedBoardings, rows, opportunityNumber);
                }
            } else for (const candidate of rows) {
                if (candidate.transferCount >= REACHABLE_STOPS_RULES.maxTransferCount) {
                    terminalOpportunityBits |= getTerminalOpportunityBit(candidate.opportunityNumber);
                } else if (useGroupedStates && rows.length === 1 && candidate.transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
                    groupedBoardings ??= new Map();
                    addOpportunityToGroup(groupedBoardings, candidate.visitedGroups, opportunityNumber);
                } else {
                    addOnboardLabel(connection.tripId, {
                        opportunityNumber: candidate.opportunityNumber,
                        deadlineMin: candidate.deadlineMin,
                        transferCount: candidate.transferCount,
                        lastArrMin: connection.depMin,
                        nextIndex: connection.fromIndex,
                        visitedGroups: candidate.visitedGroups
                    }, knownTrip);
                }
            }
            transferCandidateRowsByOpportunity[opportunityNumber] = null;
            if (transferRound2CandidateByOpportunity) transferRound2CandidateByOpportunity[opportunityNumber] = null;
        }
        if (groupedBoardings) {
            for (const [history, bits] of groupedBoardings) {
                addGroupedRoundTwoBoarding(connection.tripId, connection.fromIndex, connection.depMin, history, bits, knownTrip);
            }
        }
        const newTerminalBits = terminalOpportunityBits & ~completedTerminalBits;
        if (newTerminalBits) {
            recordTerminalRide({ connection, opportunityBits: newTerminalBits });
        }
    };

    const continueThroughEdges = ({ connection, riddenLabel, arrivalLabel }) => {
        const sourceTrip = index.tripById.get(connection.tripId);
        if (!sourceTrip || connection.toIndex !== sourceTrip.stops.length - 1) return;
        const edges = index.throughEdgesFromTripId.get(connection.tripId) || [];
        for (const edge of edges) {
            const targetTrip = index.tripById.get(edge.targetTripId);
            const targetEntry = targetTrip?.stops?.[edge.targetEntryIndex];
            if (!targetTrip || !targetEntry) continue;
            if (targetEntry.depMin < arrivalLabel.arrMin) continue;
            if (targetEntry.depMin > riddenLabel.deadlineMin) continue;
            addOnboardLabel(edge.targetTripId, {
                opportunityNumber: riddenLabel.opportunityNumber,
                deadlineMin: riddenLabel.deadlineMin,
                transferCount: riddenLabel.transferCount,
                lastArrMin: arrivalLabel.arrMin,
                nextIndex: edge.targetEntryIndex,
                visitedGroups: arrivalLabel.visitedGroups
            });
        }
    };

    const continueThroughCompactState = (connection, opportunityNumber, transferCount, arrivalHistory) => {
        const sourceTrip = index.tripById.get(connection.tripId);
        if (!sourceTrip || connection.toIndex !== sourceTrip.stops.length - 1) return;
        const deadlineMin = opportunityByNumber[opportunityNumber].deadlineMin;
        for (const edge of index.throughEdgesFromTripId.get(connection.tripId) || []) {
            const targetTrip = index.tripById.get(edge.targetTripId);
            const targetEntry = targetTrip?.stops?.[edge.targetEntryIndex];
            if (!targetTrip || !targetEntry) continue;
            if (targetEntry.depMin < connection.arrMin || targetEntry.depMin > deadlineMin) continue;
            if (transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
                addGroupedRoundTwoBoarding(edge.targetTripId, edge.targetEntryIndex, connection.arrMin,
                    arrivalHistory, opportunityNumber, targetTrip);
            } else {
                addOnboardLabel(edge.targetTripId, {
                    opportunityNumber,
                    deadlineMin,
                    transferCount,
                    lastArrMin: connection.arrMin,
                    nextIndex: edge.targetEntryIndex,
                    visitedGroups: arrivalHistory
                }, targetTrip);
            }
        }
    };

    const recordRoundTwoArrival = (connection, opportunityNumber, riddenHistory, hasNextLeg) => {
        recordReachableGroup(connection.toGroupKey, opportunityNumber,
            opportunityByNumber[opportunityNumber].deadlineMin - connection.arrMin);
        const arrivalHistory = compactArrivals.add(connection.toStopId, opportunityNumber,
            REACHABLE_STOPS_RULES.maxTransferCount - 1, connection.arrMin, connection.tripId, riddenHistory);
        if (!hasNextLeg) {
            continueThroughCompactState(connection, opportunityNumber,
                REACHABLE_STOPS_RULES.maxTransferCount - 1, arrivalHistory);
        }
    };

    const rideGroupedRoundTwoStates = (connection, trip, history, members) => {
        const riddenHistory = history | getGroupBit(connection.toGroupKey);
        const hasNextLeg = trip && connection.toIndex < trip.stops.length - 1;
        let bits = typeof members === 'number' ? 0n : members;
        if (typeof members === 'number') recordRoundTwoArrival(connection, members, riddenHistory, hasNextLeg);
        let offset = batchStart;
        while (bits) {
            let word = Number(bits & 0xffffffffn);
            while (word) {
                const opportunityNumber = offset + 31 - Math.clz32(word & -word);
                recordRoundTwoArrival(connection, opportunityNumber, riddenHistory, hasNextLeg);
                word &= word - 1;
            }
            bits >>= 32n;
            offset += 32;
        }
        if (hasNextLeg) {
            // Arrival-frontier merging is opportunity-specific. Same-trip
            // continuation keeps the shared ridden history, as before.
            addGroupedRoundTwoBoarding(connection.tripId, connection.toIndex, connection.arrMin,
                riddenHistory, members, trip);
        }
    };

    const stride = Math.max(256, Number(yieldEveryConnections) || 4096);
    let connectionNumber = 0;
    for (
        let connectionIndex = connectionStartIndex;
        connectionIndex < connectionEndIndex;
        connectionIndex += 1
    ) {
        const connection = index.connections[connectionIndex];
        connectionNumber += 1;
        if ((connectionNumber % stride) === 0) {
            throwIfAborted(signal);
            if (typeof yieldControl === 'function') await yieldControl();
            throwIfAborted(signal);
        }

        const connectionTrip = optimizeTransferChecks ? index.tripById.get(connection.tripId) : null;
        addStartBoarding(connection, connectionTrip);
        addOrdinaryTransferBoardings(connection, connectionTrip);

        const tripBuckets = onboardByTripId.get(connection.tripId);
        const tripFrontier = tripBuckets?.get(connection.fromIndex);
        if (!tripFrontier) continue;
        tripBuckets.delete(connection.fromIndex);
        if (!tripBuckets.size) onboardByTripId.delete(connection.tripId);
        let rideGroupBit = null;
        let groupedRides = null;
        for (const [opportunityNumber, ridingLabels] of tripFrontier) {
            if (typeof ridingLabels === 'bigint') {
                if (tripFrontier.size === 1) {
                    rideGroupedRoundTwoStates(connection, connectionTrip, ridingLabels, opportunityNumber);
                } else {
                    groupedRides ??= new Map();
                    addOpportunityToGroup(groupedRides, ridingLabels, opportunityNumber);
                }
                continue;
            }
            let recordedOpportunity = false;
            for (const riddenLabel of ridingLabels) {
                if (Number.isFinite(riddenLabel.lastArrMin)) {
                    const dwellMinutes = connection.depMin - riddenLabel.lastArrMin;
                    if (dwellMinutes < 0 || dwellMinutes > REACHABLE_STOPS_RULES.maxWaitMinutes) continue;
                }
                if (connection.arrMin > riddenLabel.deadlineMin) continue;

                const visitedGroups = riddenLabel.transferCount >= REACHABLE_STOPS_RULES.maxTransferCount
                    ? terminalVisitedGroups
                    : optimizeTransferChecks
                        ? riddenLabel.visitedGroups | (rideGroupBit ??= getGroupBit(connection.toGroupKey))
                        : addGroups(riddenLabel.visitedGroups, connection.toGroupKey);
                const arrivalLabel = compactArrivals ? null : {
                    opportunityNumber: riddenLabel.opportunityNumber,
                    deadlineMin: riddenLabel.deadlineMin,
                    transferCount: riddenLabel.transferCount,
                    arrMin: connection.arrMin,
                    forbiddenTripId: connection.tripId,
                    visitedGroups,
                    active: true
                };
                const remainingMinutes = riddenLabel.deadlineMin - connection.arrMin;
                if (!optimizeTransferChecks || !recordedOpportunity) {
                    recordReachableGroup(connection.toGroupKey, riddenLabel.opportunityNumber, remainingMinutes);
                    recordedOpportunity = true;
                }
                let arrivalHistory = visitedGroups;
                if (riddenLabel.transferCount < REACHABLE_STOPS_RULES.maxTransferCount) {
                    if (compactArrivals) {
                        arrivalHistory = compactArrivals.add(connection.toStopId, riddenLabel.opportunityNumber,
                            riddenLabel.transferCount, connection.arrMin, connection.tripId, visitedGroups);
                    } else {
                        addArrivalLabel(connection.toStopId, arrivalLabel);
                    }
                }

                const trip = connectionTrip || index.tripById.get(connection.tripId);
                if (trip && connection.toIndex < trip.stops.length - 1) {
                    riddenLabel.lastArrMin = connection.arrMin;
                    riddenLabel.nextIndex = connection.toIndex;
                    riddenLabel.visitedGroups = visitedGroups;
                    if (useGroupedStates && riddenLabel.transferCount === REACHABLE_STOPS_RULES.maxTransferCount - 1) {
                        addGroupedRoundTwoBoarding(connection.tripId, connection.toIndex, connection.arrMin,
                            visitedGroups, riddenLabel.opportunityNumber, connectionTrip);
                    } else {
                        addOnboardLabel(connection.tripId, riddenLabel, connectionTrip);
                    }
                } else if (compactArrivals) {
                    continueThroughCompactState(connection, riddenLabel.opportunityNumber,
                        riddenLabel.transferCount, arrivalHistory);
                } else {
                    continueThroughEdges({ connection, riddenLabel, arrivalLabel });
                }
            }
        }
        if (groupedRides) {
            for (const [history, bits] of groupedRides) {
                rideGroupedRoundTwoStates(connection, connectionTrip, history, bits);
            }
        }
    }
        throwIfAborted(signal);
    }
    throwIfAborted(signal);

    const remainingMsByStop = new Map();
    const sortedGroupKeys = Array.from(bestRemainingBucketByGroup.keys()).sort();
    for (const groupKey of sortedGroupKeys) {
        const bestByOpportunity = bestRemainingBucketByGroup.get(groupKey);
        const opportunitiesByBucketMs = new Map();
        for (let opportunityNumber = 0; opportunityNumber < bestByOpportunity.length; opportunityNumber += 1) {
            const encodedBucket = bestByOpportunity[opportunityNumber];
            if (!encodedBucket) continue;
            const bucketedMs = Math.round((encodedBucket - 1) * bucketSizeMinutes * 60000);
            if (!opportunitiesByBucketMs.has(bucketedMs)) opportunitiesByBucketMs.set(bucketedMs, new Set());
            opportunitiesByBucketMs.get(bucketedMs).add(opportunityNumber);
        }

        let cumulativeCount = 0;
        const circles = [];
        const buckets = Array.from(opportunitiesByBucketMs.entries()).sort((a, b) => b[0] - a[0]);
        for (const [remainMs, opportunityNumbers] of buckets) {
            cumulativeCount += opportunityNumbers.size;
            const representativeOpportunityId = Array.from(
                opportunityNumbers,
                (opportunityNumber) => opportunityByNumber[opportunityNumber]?.opportunityId || ""
            ).sort()[0] || "";
            circles.push({
                remainMs,
                count: cumulativeCount,
                tripId: representativeOpportunityId
            });
        }

        const stationIds = Array.from(index.stationIdsByGroupKey.get(groupKey) || [groupKey]).sort();
        for (const stationId of stationIds) remainingMsByStop.set(stationId, circles);
    }

    return {
        reachableStops: Array.from(remainingMsByStop.keys()),
        remainingMsByStop,
        meta: buildReachableStopsOpportunityMeta({
            minutes: requestedMinutes,
            serviceDay
        })
    };
};

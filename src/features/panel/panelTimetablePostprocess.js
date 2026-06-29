import { getAlternateTripSources } from '../../domain/alternateLineMembership.js';

const toText = (value) => String(value ?? '').trim();

const normalizeRefs = (value) => {
    if (Array.isArray(value)) return value.map((item) => toText(item)).filter(Boolean);
    const text = toText(value);
    return text ? [text] : [];
};

const getRefLinePrefix = (refId) => {
    const parts = toText(refId).split('.').map((part) => part.trim()).filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '';
};

const getTripStops = (trip) => (Array.isArray(trip?.tt) ? trip.tt : []);

const cloneTrip = (trip) => {
    if (!trip || typeof trip !== 'object') return trip;
    if (typeof structuredClone === 'function') return structuredClone(trip);
    return JSON.parse(JSON.stringify(trip));
};

const cloneTripForDisplayLine = ({
    direction = '',
    fromLineId = '',
    sourceLineId = '',
    trip = null
} = {}) => {
    const newTrip = cloneTrip(trip);
    if (!newTrip || typeof newTrip !== 'object') return newTrip;

    if (typeof newTrip.id === 'string') {
        if (newTrip.realOriginId === undefined) newTrip.realOriginId = newTrip.id;
        newTrip.id = newTrip.id.replace(fromLineId, sourceLineId);
    }

    if (typeof newTrip.d === 'string' && toText(direction)) {
        newTrip.originD = newTrip.d;
        newTrip.d = direction;
    }

    return newTrip;
};

const ensureRealOriginId = (trip) => {
    if (!trip || typeof trip !== 'object') return trip;
    if (trip.realOriginId !== undefined) return trip;
    return {
        ...trip,
        realOriginId: trip.id
    };
};

const hasSinglePtRefToSourceLine = (pt, sourceLineId) => {
    if (!Array.isArray(pt) || pt.length !== 1) return false;
    return getRefLinePrefix(pt[0]) === sourceLineId;
};

const collectEndpointContinuationInfo = ({
    rawList = [],
    stationKey = ''
} = {}) => {
    const nextLinePrefixes = new Set();
    const previousLinePrefixes = new Set();
    const currentLineDirectionForNext = new Set();
    const currentLineDirectionForPrevious = new Set();

    for (const trip of Array.isArray(rawList) ? rawList : []) {
        if (/Loop/i.test(toText(trip?.d))) continue;

        const stops = getTripStops(trip);
        const isTerminal = stops.at(-1)?.s === stationKey;
        const isOrigin = stops[0]?.s === stationKey;
        const nt = trip?.nt;
        const pt = trip?.pt;

        if (isTerminal && nt) {
            for (const ref of normalizeRefs(nt)) {
                const prefix = getRefLinePrefix(ref);
                const direction = trip?.d;
                if (prefix) nextLinePrefixes.add(prefix);
                if (direction) currentLineDirectionForNext.add(direction);
            }
        }

        if (isOrigin && pt) {
            for (const ref of normalizeRefs(pt)) {
                const prefix = getRefLinePrefix(ref);
                const direction = trip?.d;
                if (prefix) previousLinePrefixes.add(prefix);
                if (direction) currentLineDirectionForPrevious.add(direction);
            }
        }
    }

    return {
        currentLineDirectionForNext,
        currentLineDirectionForPrevious,
        nextLinePrefixes,
        previousLinePrefixes
    };
};

const isStationInGroup = (stationGroupsIndex, sourceStationId, targetStationId) => {
    const sourceId = toText(sourceStationId);
    const targetId = toText(targetStationId);
    if (!sourceId || !targetId) return false;
    if (sourceId === targetId) return true;
    return stationGroupsIndex?.get?.(sourceId)?.includes?.(targetId) === true;
};

const uniqueTexts = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
        .map((value) => toText(value))
        .filter(Boolean)
));

const buildStationEquivalenceIndex = ({
    stationGroupsIndex = null,
    stationIds = []
} = {}) => {
    const baseEntries = stationGroupsIndex instanceof Map ? stationGroupsIndex.entries() : [];
    const out = new Map();
    for (const [key, value] of baseEntries) {
        out.set(toText(key), uniqueTexts(Array.isArray(value) ? value : []));
    }

    const relatedIds = new Set();
    for (const stationId of uniqueTexts(stationIds)) {
        relatedIds.add(stationId);
        for (const value of out.get(stationId) || []) relatedIds.add(value);
    }

    const merged = uniqueTexts(Array.from(relatedIds));
    if (!merged.length) return out;

    for (const stationId of merged) {
        out.set(stationId, uniqueTexts([
            ...(out.get(stationId) || []),
            ...merged
        ]));
    }

    return out;
};

const isSameStationForPanel = (stationGroupsIndex, stationId, targetStationId) => {
    const station = toText(stationId);
    const target = toText(targetStationId);
    if (!station || !target) return false;
    if (station === target) return true;
    return (
        stationGroupsIndex?.get?.(station)?.includes?.(target) === true ||
        stationGroupsIndex?.get?.(target)?.includes?.(station) === true
    );
};

const tripStopsAtStation = (trip, stationKey, stationGroupsIndex) => {
    const targetId = toText(stationKey);
    if (!targetId) return false;
    return getTripStops(trip).some((stop) => isSameStationForPanel(stationGroupsIndex, stop?.s, targetId));
};

const replaceStationValue = (value, fromStationId, toStationId, stationGroupsIndex) => {
    if (Array.isArray(value)) {
        return value.map((item) => (
            isSameStationForPanel(stationGroupsIndex, item, fromStationId) ? toStationId : item
        ));
    }
    return isSameStationForPanel(stationGroupsIndex, value, fromStationId) ? toStationId : value;
};

const rewriteTripStationForDisplay = ({
    fromStationId = '',
    stationGroupsIndex = null,
    toStationId = '',
    trip = null
} = {}) => {
    const fromId = toText(fromStationId);
    const toId = toText(toStationId);
    if (!trip || typeof trip !== 'object' || !fromId || !toId) return trip;

    if (Array.isArray(trip.tt)) {
        trip.tt = trip.tt.map((stop) => {
            if (!stop || typeof stop !== 'object') return stop;
            if (!isSameStationForPanel(stationGroupsIndex, stop.s, fromId)) return stop;
            return {
                ...stop,
                s: toId
            };
        });
    }

    if (trip.os !== undefined) trip.os = replaceStationValue(trip.os, fromId, toId, stationGroupsIndex);
    if (trip.ds !== undefined) trip.ds = replaceStationValue(trip.ds, fromId, toId, stationGroupsIndex);

    return trip;
};

const getTripIdentity = (trip) => (
    toText(trip?.realOriginId) ||
    toText(trip?.id) ||
    toText(trip?.t) ||
    toText(trip?.n)
);

const getOverlayTripDedupeKey = ({ displayLineId = '', stationId = '', trip = null } = {}) => {
    const identity = getTripIdentity(trip);
    if (!identity) return '';
    return `${identity}\u0000${toText(displayLineId)}\u0000${toText(stationId)}`;
};

const buildTripDedupeSet = ({
    displayLineId = '',
    stationId = '',
    trips = []
} = {}) => {
    const out = new Set();
    for (const trip of Array.isArray(trips) ? trips : []) {
        const key = getOverlayTripDedupeKey({ displayLineId, stationId, trip });
        if (key) out.add(key);
    }
    return out;
};

const appendUniqueOverlayTrip = ({
    displayLineId = '',
    seenKeys,
    stationId = '',
    targetList,
    trip = null
} = {}) => {
    if (!Array.isArray(targetList) || !trip) return false;
    const key = getOverlayTripDedupeKey({ displayLineId, stationId, trip });
    if (key && seenKeys?.has?.(key)) return false;
    if (key) seenKeys?.add?.(key);
    targetList.push(trip);
    return true;
};

const buildAlternateSourceRequests = ({
    alternateTripSourceIndex = null,
    displayLineId = '',
    sourceLineId = '',
    stationKey = ''
} = {}) => {
    const sources = getAlternateTripSources(alternateTripSourceIndex, stationKey, sourceLineId);
    return sources
        .map((source) => ({
            displayLineId: toText(source?.displayLineId || displayLineId),
            displayStationId: toText(source?.displayStationId || stationKey),
            reason: 'alternate',
            resolveStation: false,
            sourceLineId: toText(source?.sourceLineId),
            stationId: toText(source?.sourceStationId)
        }))
        .filter((source) => source.sourceLineId && source.stationId);
};

const applyEndpointOverlay = async ({
    allowNextOverlay = true,
    allowPreviousOverlay = true,
    debug = null,
    loadTimetableForLineId = async () => null,
    rawList = [],
    sourceLineId = '',
    stationGroupsIndex = null,
    stationKey = ''
} = {}) => {
    const sourceId = toText(sourceLineId);
    const stationId = toText(stationKey);
    let displayList = (Array.isArray(rawList) ? rawList : []).slice();
    const info = collectEndpointContinuationInfo({ rawList, stationKey: stationId });

    if (debug) {
        debug.nextLineIds = Array.from(info.nextLinePrefixes);
        debug.previousLineIds = Array.from(info.previousLinePrefixes);
    }

    if (allowNextOverlay && info.nextLinePrefixes.size === 1) {
        const beforeCount = displayList.length;
        displayList = displayList.filter((trip) => {
            const stops = getTripStops(trip);
            const isTerminal = stops.at(-1)?.s === stationId;
            return !(isTerminal && trip?.nt);
        });
        if (debug) debug.removedTerminalTrips = beforeCount - displayList.length;

        const nextLineId = Array.from(info.nextLinePrefixes)[0];
        const currentLineDirection = Array.from(info.currentLineDirectionForNext)[0];
        const nextLineSourceData = await loadTimetableForLineId(nextLineId);
        for (const trip of Array.isArray(nextLineSourceData) ? nextLineSourceData : []) {
            let shouldAdd = false;
            const originStation = getTripStops(trip)[0]?.s;
            const isOrigin = originStation && isStationInGroup(stationGroupsIndex, originStation, stationId);
            const pt = trip?.pt;
            if (isOrigin && !pt) shouldAdd = true;
            if (isOrigin && pt && hasSinglePtRefToSourceLine(pt, sourceId)) {
                shouldAdd = true;
            }
            if (!shouldAdd) continue;

            displayList.push(cloneTripForDisplayLine({
                direction: currentLineDirection,
                fromLineId: nextLineId,
                sourceLineId: sourceId,
                trip
            }));
            if (debug) debug.addedNextTrips += 1;
        }
    }

    if (allowPreviousOverlay && info.previousLinePrefixes.size === 1) {
        const previousLineId = Array.from(info.previousLinePrefixes)[0];
        const currentLineDirection = Array.from(info.currentLineDirectionForPrevious)[0];
        const previousLineSourceData = await loadTimetableForLineId(previousLineId);
        for (const trip of Array.isArray(previousLineSourceData) ? previousLineSourceData : []) {
            const destStation = getTripStops(trip).at(-1)?.s;
            const isTerminal = destStation && isStationInGroup(stationGroupsIndex, destStation, stationId);
            const nt = trip?.nt;
            if (!(isTerminal && !nt)) continue;

            displayList.push(cloneTripForDisplayLine({
                direction: currentLineDirection,
                fromLineId: previousLineId,
                sourceLineId: sourceId,
                trip
            }));
            if (debug) debug.addedPreviousTrips += 1;
        }
    }

    return {
        displayList,
        info
    };
};

const getOnlySetValue = (set) => {
    if (!(set instanceof Set) || set.size !== 1) return '';
    return toText(Array.from(set)[0]);
};

const hasMatchingSingletonContinuation = (displayInfo, sourceInfo, kind) => {
    if (kind === 'next') {
        const displayLineId = getOnlySetValue(displayInfo?.nextLinePrefixes);
        const sourceLineId = getOnlySetValue(sourceInfo?.nextLinePrefixes);
        return !!displayLineId && displayLineId === sourceLineId;
    }
    if (kind === 'previous') {
        const displayLineId = getOnlySetValue(displayInfo?.previousLinePrefixes);
        const sourceLineId = getOnlySetValue(sourceInfo?.previousLinePrefixes);
        return !!displayLineId && displayLineId === sourceLineId;
    }
    return false;
};

const buildAlternateOverlayTrips = async ({
    displayEndpointInfo = null,
    displayLineId = '',
    loadTimetableForLineId = async () => null,
    request = null,
    stationGroupsIndex = null,
    stationKey = ''
} = {}) => {
    const sourceLineId = toText(request?.sourceLineId);
    const sourceStationId = toText(request?.stationId);
    const displayStationId = toText(stationKey);
    if (!sourceLineId || !sourceStationId || !displayStationId) {
        return {
            addedTrips: [],
            allowNextOverlay: false,
            allowPreviousOverlay: false,
            sourceEndpointInfo: null
        };
    }

    const sourceRawList = await loadTimetableForLineId(sourceLineId);
    const sourceList = Array.isArray(sourceRawList) ? sourceRawList : [];
    const sourceStationGroupsIndex = buildStationEquivalenceIndex({
        stationGroupsIndex,
        stationIds: [sourceStationId, displayStationId]
    });
    const sourceEndpointInfo = collectEndpointContinuationInfo({
        rawList: sourceList,
        stationKey: sourceStationId
    });
    const allowNextOverlay = hasMatchingSingletonContinuation(displayEndpointInfo, sourceEndpointInfo, 'next');
    const allowPreviousOverlay = hasMatchingSingletonContinuation(displayEndpointInfo, sourceEndpointInfo, 'previous');
    const { displayList: sourceDisplayList } = await applyEndpointOverlay({
        allowNextOverlay,
        allowPreviousOverlay,
        loadTimetableForLineId,
        rawList: sourceList,
        sourceLineId,
        stationGroupsIndex: sourceStationGroupsIndex,
        stationKey: sourceStationId
    });

    const addedTrips = [];
    for (const trip of sourceDisplayList) {
        if (!tripStopsAtStation(trip, sourceStationId, sourceStationGroupsIndex)) continue;
        const cloned = cloneTripForDisplayLine({
            fromLineId: sourceLineId,
            sourceLineId: displayLineId,
            trip
        });
        rewriteTripStationForDisplay({
            fromStationId: sourceStationId,
            stationGroupsIndex: sourceStationGroupsIndex,
            toStationId: displayStationId,
            trip: cloned
        });
        addedTrips.push(cloned);
    }

    return {
        addedTrips,
        allowNextOverlay,
        allowPreviousOverlay,
        sourceEndpointInfo
    };
};

export const postprocessPanelTimetableTrips = async ({
    alternateSourcePlanIndex = null,
    alternateTripSourceIndex = null,
    displayLineId = '',
    enableAlternateOverlay = false,
    loadTimetableForLineId = async () => null,
    rawList = [],
    sourceLineId = '',
    stationGroupsIndex = null,
    stationKey = ''
} = {}) => {
    const sourceId = toText(sourceLineId);
    const displayId = toText(displayLineId) || sourceId;
    const stationId = toText(stationKey);
    const list = Array.isArray(rawList) ? rawList : [];
    let displayList = list.slice();
    const previewList = list.slice();
    const sourceRequests = buildAlternateSourceRequests({
        alternateTripSourceIndex: alternateTripSourceIndex || alternateSourcePlanIndex,
        displayLineId: displayId,
        sourceLineId: sourceId,
        stationKey: stationId
    });

    const debug = {
        displayLineId: displayId,
        sourceLineId: sourceId,
        stationKey: stationId,
        endpointOverlay: {
            addedNextTrips: 0,
            addedPreviousTrips: 0,
            nextLineIds: [],
            previousLineIds: [],
            removedTerminalTrips: 0
        },
        alternate: {
            enabled: enableAlternateOverlay === true,
            applied: false,
            addedTrips: 0,
            addedPreviewTrips: 0,
            sourceRequests
        }
    };

    if (!sourceId || !stationId || !list.length) {
        return {
            displayList: displayList.map(ensureRealOriginId),
            previewList,
            sourceRequests,
            postprocessDebug: debug
        };
    }

    const endpointOverlayResult = await applyEndpointOverlay({
        debug: debug.endpointOverlay,
        loadTimetableForLineId,
        rawList: list,
        sourceLineId: sourceId,
        stationGroupsIndex,
        stationKey: stationId
    });
    displayList = endpointOverlayResult.displayList;

    if (enableAlternateOverlay === true && sourceRequests.length) {
        const seenDisplayKeys = buildTripDedupeSet({
            displayLineId: displayId,
            stationId,
            trips: displayList
        });
        const seenPreviewKeys = buildTripDedupeSet({
            displayLineId: displayId,
            stationId,
            trips: previewList
        });

        for (const request of sourceRequests) {
            const overlay = await buildAlternateOverlayTrips({
                displayEndpointInfo: endpointOverlayResult.info,
                displayLineId: sourceId,
                loadTimetableForLineId,
                request,
                stationGroupsIndex,
                stationKey: stationId
            });
            debug.alternate.applied = true;
            debug.alternate.addedTrips += overlay.addedTrips.length;
            if (overlay.allowNextOverlay) {
                debug.alternate.addedNextOverlayTrips = (debug.alternate.addedNextOverlayTrips || 0) + 1;
            }
            if (overlay.allowPreviousOverlay) {
                debug.alternate.addedPreviousOverlayTrips = (debug.alternate.addedPreviousOverlayTrips || 0) + 1;
            }

            for (const trip of overlay.addedTrips) {
                if (appendUniqueOverlayTrip({
                    displayLineId: displayId,
                    seenKeys: seenDisplayKeys,
                    stationId,
                    targetList: displayList,
                    trip
                })) {
                    debug.alternate.addedDisplayTrips = (debug.alternate.addedDisplayTrips || 0) + 1;
                }
                if (appendUniqueOverlayTrip({
                    displayLineId: displayId,
                    seenKeys: seenPreviewKeys,
                    stationId,
                    targetList: previewList,
                    trip
                })) {
                    debug.alternate.addedPreviewTrips += 1;
                }
            }
        }
    }

    return {
        displayList: displayList.map(ensureRealOriginId),
        previewList,
        sourceRequests,
        postprocessDebug: debug
    };
};

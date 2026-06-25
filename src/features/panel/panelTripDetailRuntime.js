import { buildTripPreviewKey, buildVirtualTimetableChain } from '../../lib/trip-preview.js';



// panelTripPreviewLineIdentity.js
const defaultToText_panelTripPreviewLineIdentity = (value) => String(value ?? '').trim();

export const withTripPreviewLineIdentity = (segment, { toText = defaultToText_panelTripPreviewLineIdentity } = {}) => {
    const seg = segment || {};
    const r = toText(seg.r || seg.routeLineId || seg.railwayId || seg.lineId);
    const geometryLineId = toText(seg.geometryLineId || seg.geometry_line_id || r);
    const offsetLineId = toText(seg.offsetLineId || seg.line_offset_id || r || geometryLineId);
    const lineId = toText(seg.lineId || r);

    return {
        ...seg,
        lineId,
        ...(r ? { r } : {}),
        ...(geometryLineId ? { geometryLineId } : {}),
        ...(offsetLineId ? { offsetLineId } : {})
    };
};

// panelTripDetailPreviewPayloadBuilder.js
const defaultToText_panelTripDetailPreviewPayloadBuilder = (value) => String(value ?? '').trim();

const buildSegmentsWithIdentity_panelTripDetailPreviewPayloadBuilder = (segments = [], {
    toText = defaultToText_panelTripDetailPreviewPayloadBuilder
} = {}) => segments.map((seg) => withTripPreviewLineIdentity(seg, { toText }));

const buildPreviewSegmentsFromSegmentsWithPast_panelTripDetailPreviewPayloadBuilder = ({
    kindFilter,
    payloadTypeColor = '',
    segmentsWithPast = [],
    toText = defaultToText_panelTripDetailPreviewPayloadBuilder
} = {}) => {
    const out = [];
    for (const seg of (Array.isArray(segmentsWithPast) ? segmentsWithPast : [])) {
        if (toText(seg?.kind) !== toText(kindFilter)) continue;
        const stationIds = Array.isArray(seg?.rows)
            ? seg.rows.map((row) => toText(row?.stationId)).filter(Boolean)
            : [];
        if (stationIds.length < 2) continue;
        out.push({
            kind: toText(seg?.kind || kindFilter),
            lineId: toText(seg?.lineId),
            r: toText(seg?.r || seg?.lineId),
            geometryLineId: toText(seg?.geometryLineId || seg?.geometry_line_id),
            offsetLineId: toText(seg?.offsetLineId || seg?.line_offset_id),
            d: toText(seg?.d),
            stationIds,
            typeColor: toText(seg?.typeColor || payloadTypeColor)
        });
    }
    return buildSegmentsWithIdentity_panelTripDetailPreviewPayloadBuilder(out, { toText });
};

export const buildPanelTripPreviewScheduleArgs = ({
    trip,
    tripKey,
    lineId,
    typeName = '',
    typeColor = '',
    hasNt = false,
    fitMode = '',
    throughCategoryColor = '',
    throughCategoryLabel = '',
    segmentsWithPast = [],
    activeBranchLanes = [],
    branchMode = '',
    pinned = false,
    tripLocked = false,
    getTripLineId = () => '',
    getLineMeta = () => null,
    toText = defaultToText_panelTripDetailPreviewPayloadBuilder
} = {}) => {
    const addPreviewLineIdentity = (seg) => withTripPreviewLineIdentity(seg, { toText });

    const payloadSegments = buildSegmentsWithIdentity_panelTripDetailPreviewPayloadBuilder((segmentsWithPast || []).map((seg) => ({
        kind: seg.kind,
        lineId: toText(seg.lineId),
        r: toText(seg.r || seg.lineId),
        d: toText(seg?.d || trip?.d),
        stationIds: (seg.rows || []).map((row) => toText(row.stationId)).filter(Boolean),
        typeColor: throughCategoryColor || toText(seg.typeColor)
    })), { toText });

    const payloadChainLineIds = payloadSegments
        .map((seg) => toText(seg?.r || seg?.lineId))
        .filter(Boolean);
    const mainSeg = segmentsWithPast.find((segment) => segment.kind === 'main') || null;
    const mainRows = Array.isArray(mainSeg?.rows) ? mainSeg.rows : [];
    const mainOriginStationId = mainRows.length ? toText(mainRows[0]?.stationId) : '';
    const mainTerminalStationId = mainRows.length ? toText(mainRows[mainRows.length - 1]?.stationId) : '';
    const mainLineId = toText(getTripLineId(trip) || lineId);

    const payload = {
        tripKey: toText(tripKey),
        selectedLineId: toText(lineId),
        selectedLineName: toText(getLineMeta(toText(lineId))?.name || toText(lineId)),
        mainLineId,
        originStationId: mainOriginStationId,
        mainTerminalStationId,
        terminalStationId: mainTerminalStationId,
        typeName: toText(typeName),
        typeColor: throughCategoryColor || toText(typeColor),
        hasNt,
        r: mainLineId,
        chainLineIds: payloadChainLineIds,
        virtualTimetable: buildVirtualTimetableChain(payloadSegments, toText(tripKey)),
        segments: payloadSegments,
        previewSource: 'panel-trip',
        endpointDisplayMode: 'destination-pin-only',
        fitMode: toText(fitMode)
    };

    if (!throughCategoryLabel && branchMode && Array.isArray(activeBranchLanes) && activeBranchLanes.length >= 2) {
        const mainSegForPreview = segmentsWithPast.find((segment) => toText(segment?.kind) === 'main') || null;
        const mainSegStationIds = Array.isArray(mainSegForPreview?.rows)
            ? mainSegForPreview.rows.map((row) => toText(row?.stationId)).filter(Boolean)
            : [];
        const mainSegLineId = toText(mainSegForPreview?.lineId || payload?.mainLineId || payload?.selectedLineId);
        const mainSegDir = toText(mainSegForPreview?.d || trip?.d);

        const previewPtContextSegments = buildPreviewSegmentsFromSegmentsWithPast_panelTripDetailPreviewPayloadBuilder({
            kindFilter: 'pt',
            payloadTypeColor: payload.typeColor,
            segmentsWithPast,
            toText
        });
        const previewNtContextSegments = buildPreviewSegmentsFromSegmentsWithPast_panelTripDetailPreviewPayloadBuilder({
            kindFilter: 'nt',
            payloadTypeColor: payload.typeColor,
            segmentsWithPast,
            toText
        });

        const virtualTrips = [];
        for (let index = 0; index < activeBranchLanes.length; index += 1) {
            const lane = activeBranchLanes[index] || {};
            const laneStationIds = Array.isArray(lane?.rows)
                ? lane.rows.map((row) => toText(row?.stationId)).filter(Boolean)
                : [];
            const laneLineId = toText(lane?.lineId || mainSegLineId);
            const laneDir = toText(lane?.d || mainSegDir);
            const lanePreviewSegments = Array.isArray(lane?.previewSegments)
                ? lane.previewSegments.filter((seg) => Array.isArray(seg?.stationIds) && seg.stationIds.length >= 2)
                : [];

            const chainSegments = [];
            if (branchMode === 'merge') {
                if (lanePreviewSegments.length) {
                    chainSegments.push(...lanePreviewSegments.map((seg) => addPreviewLineIdentity({
                        kind: 'pt',
                        lineId: toText(seg?.lineId || laneLineId),
                        r: toText(seg?.r || seg?.lineId || laneLineId),
                        geometryLineId: toText(seg?.geometryLineId || seg?.geometry_line_id),
                        offsetLineId: toText(seg?.offsetLineId || seg?.line_offset_id),
                        d: toText(seg?.d || laneDir),
                        stationIds: Array.isArray(seg?.stationIds) ? seg.stationIds.map((value) => toText(value)).filter(Boolean) : [],
                        typeColor: toText(seg?.typeColor || lane?.typeColor || payload?.typeColor)
                    })));
                } else if (laneStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'pt',
                        lineId: laneLineId,
                        r: laneLineId,
                        d: laneDir,
                        stationIds: laneStationIds,
                        typeColor: toText(lane?.typeColor || payload?.typeColor)
                    }));
                }
                if (mainSegStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'main',
                        lineId: mainSegLineId,
                        r: toText(mainSegForPreview?.r || mainSegLineId),
                        d: mainSegDir,
                        stationIds: mainSegStationIds,
                        typeColor: toText(payload?.typeColor)
                    }));
                }
                chainSegments.push(...previewNtContextSegments);
            } else {
                chainSegments.push(...previewPtContextSegments);
                if (mainSegStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'main',
                        lineId: mainSegLineId,
                        r: toText(mainSegForPreview?.r || mainSegLineId),
                        d: mainSegDir,
                        stationIds: mainSegStationIds,
                        typeColor: toText(payload?.typeColor)
                    }));
                }
                if (lanePreviewSegments.length) {
                    chainSegments.push(...lanePreviewSegments.map((seg) => addPreviewLineIdentity({
                        kind: 'nt',
                        lineId: toText(seg?.lineId || laneLineId),
                        r: toText(seg?.r || seg?.lineId || laneLineId),
                        geometryLineId: toText(seg?.geometryLineId || seg?.geometry_line_id),
                        offsetLineId: toText(seg?.offsetLineId || seg?.line_offset_id),
                        d: toText(seg?.d || laneDir),
                        stationIds: Array.isArray(seg?.stationIds) ? seg.stationIds.map((value) => toText(value)).filter(Boolean) : [],
                        typeColor: toText(seg?.typeColor || lane?.typeColor || payload?.typeColor)
                    })));
                } else if (laneStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'nt',
                        lineId: laneLineId,
                        r: laneLineId,
                        d: laneDir,
                        stationIds: laneStationIds,
                        typeColor: toText(lane?.typeColor || payload?.typeColor)
                    }));
                }
            }

            const normalizedChainSegments = chainSegments.filter((seg) => {
                const stationIds = Array.isArray(seg?.stationIds) ? seg.stationIds.map((value) => toText(value)).filter(Boolean) : [];
                seg.stationIds = stationIds;
                return stationIds.length >= 2 && !!toText(seg?.lineId);
            });
            if (!normalizedChainSegments.length) continue;

            const firstIds = normalizedChainSegments[0]?.stationIds || [];
            const lastIds = normalizedChainSegments[normalizedChainSegments.length - 1]?.stationIds || [];
            const normalizedChainLineIds = normalizedChainSegments
                .map((seg) => toText(seg?.r || seg?.lineId))
                .filter(Boolean);
            const virtualTripKey = `${toText(tripKey)}::branch-${index + 1}`;

            virtualTrips.push({
                tripKey: virtualTripKey,
                selectedLineId: payload.selectedLineId,
                selectedLineName: payload.selectedLineName,
                mainLineId: payload.mainLineId,
                r: normalizedChainLineIds[0] || payload.r || payload.mainLineId,
                chainLineIds: normalizedChainLineIds,
                virtualTimetable: buildVirtualTimetableChain(normalizedChainSegments, virtualTripKey),
                originStationId: toText(firstIds[0]),
                mainTerminalStationId: toText(lastIds[lastIds.length - 1]),
                terminalStationId: toText(lastIds[lastIds.length - 1]),
                typeName: payload.typeName,
                typeColor: payload.typeColor,
                hasNt: branchMode === 'split',
                forceIncludeNt: branchMode === 'split',
                segments: normalizedChainSegments,
                fitMode: payload.fitMode,
                endpointDisplayMode: payload.endpointDisplayMode,
                previewSource: payload.previewSource,
                __previewSource: payload.__previewSource,
                previewInteraction: payload.previewInteraction,
                __previewInteraction: payload.__previewInteraction
            });
        }

        if (virtualTrips.length >= 2) {
            payload.virtualTrips = virtualTrips;
        }
    }

    return {
        previewKey: buildTripPreviewKey(lineId, tripKey),
        payload,
        immediate: !!pinned || tripLocked
    };
};

// panelTripDetailTripChainWalker.js
const defaultToText_panelTripDetailTripChainWalker = (value) => String(value ?? '').trim();

export const collectPanelTripDetailTripChainByTrip = async ({
    startTrip = null,
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    toText = defaultToText_panelTripDetailTripChainWalker
} = {}) => {
    const out = [];
    const seenRefs = new Set();
    const seenTrips = new Set();
    let cursor = startTrip;

    for (let index = 0; index < maxSteps; index += 1) {
        const refs = Array.isArray(cursor?.[key]) ? cursor[key] : (cursor?.[key] ? [cursor[key]] : []);
        const refId = toText(refs?.[0]);
        if (!refId) break;
        if (seenRefs.has(refId)) break;
        seenRefs.add(refId);

        const refTrip = await loadTripByRefId(refId);
        if (!isTokenCurrent()) return null;
        if (!refTrip) break;

        const tripId = toText(refTrip?.id) || toText(refTrip?.t);
        if (tripId && seenTrips.has(tripId)) break;

        out.push(refTrip);
        if (tripId) seenTrips.add(tripId);

        cursor = refTrip;
    }

    return out;
};

// panelTripDetailRefChainCollector.js
const defaultToText_panelTripDetailRefChainCollector = (value) => String(value ?? '').trim();

const normalizeStepKey_panelTripDetailRefChainCollector = (key) => (key === 'pt' ? 'pt' : 'nt');

const readNextRefs_panelTripDetailRefChainCollector = (trip, stepKey, toText) => (
    (Array.isArray(trip?.[stepKey]) ? trip[stepKey] : (trip?.[stepKey] ? [trip[stepKey]] : []))
        .map((value) => toText(value))
        .filter(Boolean)
);

const walkPanelTripDetailRefChain_panelTripDetailRefChainCollector = async ({
    startRefId = '',
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    onTrip = () => undefined,
    toText = defaultToText_panelTripDetailRefChainCollector
} = {}) => {
    const stepKey = normalizeStepKey_panelTripDetailRefChainCollector(key);
    const seenRefs = new Set();
    const seenTrips = new Set();
    let refId = toText(startRefId);

    for (let index = 0; index < maxSteps; index += 1) {
        if (!refId) break;
        if (seenRefs.has(refId)) break;
        seenRefs.add(refId);

        const refTrip = await loadTripByRefId(refId);
        if (!isTokenCurrent()) return null;
        if (!refTrip) break;

        const tripId = toText(refTrip?.id) || toText(refTrip?.t);
        if (tripId && seenTrips.has(tripId)) break;
        if (tripId) seenTrips.add(tripId);

        const nextRefs = readNextRefs_panelTripDetailRefChainCollector(refTrip, stepKey, toText);
        const next = onTrip(refTrip, nextRefs);
        if (next?.done) return next.value;

        refId = nextRefs[0] || '';
    }

    return onTrip(null, null)?.finalValue;
};

export const collectPanelTripDetailRefChainTripsFromRef = async ({
    startRefId = '',
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    toText = defaultToText_panelTripDetailRefChainCollector
} = {}) => {
    const out = [];
    const result = await walkPanelTripDetailRefChain_panelTripDetailRefChainCollector({
        startRefId,
        key,
        loadTripByRefId,
        isTokenCurrent,
        maxSteps,
        toText,
        onTrip: (trip) => {
            if (!trip) return { finalValue: out };
            out.push(trip);
            return undefined;
        }
    });
    return result;
};

export const resolvePanelTripDetailFirstMultiRefsAlongChain = async ({
    startRefId = '',
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    toText = defaultToText_panelTripDetailRefChainCollector
} = {}) => {
    const result = await walkPanelTripDetailRefChain_panelTripDetailRefChainCollector({
        startRefId,
        key,
        loadTripByRefId,
        isTokenCurrent,
        maxSteps,
        toText,
        onTrip: (_trip, nextRefs) => {
            if (!nextRefs) return { finalValue: [] };
            if (nextRefs.length >= 2) {
                return { done: true, value: nextRefs };
            }
            return undefined;
        }
    });
    if (result === null) return null;
    return Array.isArray(result) ? result : [];
};

// panelTripDetailThroughServiceDirectionResolver.js
const defaultToText_panelTripDetailThroughServiceDirectionResolver = (value) => String(value ?? '').trim();

const getStationToken_panelTripDetailThroughServiceDirectionResolver = (stationId, toText = defaultToText_panelTripDetailThroughServiceDirectionResolver) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((value) => value.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
};

export const derivePanelTripDetailThroughServiceDirection = async ({
    trip = null,
    displayLineId = '',
    throughServiceConfigs = [],
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    toText = defaultToText_panelTripDetailThroughServiceDirectionResolver
} = {}) => {
    const lineId = toText(displayLineId);
    const targetInfo = (Array.isArray(throughServiceConfigs) ? throughServiceConfigs : [])
        .find((info) => info?.tempId === lineId);
    const directionRule = targetInfo?.directionRule;
    if (!directionRule) return '';

    const ptChain = await collectPanelTripDetailTripChainByTrip({
        startTrip: trip,
        key: 'pt',
        loadTripByRefId,
        isTokenCurrent,
        toText
    });
    if (!isTokenCurrent()) return null;

    const ntChain = await collectPanelTripDetailTripChainByTrip({
        startTrip: trip,
        key: 'nt',
        loadTripByRefId,
        isTokenCurrent,
        toText
    });
    if (!isTokenCurrent()) return null;

    const orderedTrips = [
        ...(Array.isArray(ptChain) ? ptChain.slice().reverse() : []),
        trip,
        ...(Array.isArray(ntChain) ? ntChain : [])
    ];

    let southIdx = -1;
    let northIdx = -1;
    let currentStationIdx = 0;

    for (const chainTrip of orderedTrips) {
        const tt = Array.isArray(chainTrip?.tt) ? chainTrip.tt : [];
        for (const stop of tt) {
            const token = getStationToken_panelTripDetailThroughServiceDirectionResolver(stop?.s, toText);
            if (!token) {
                currentStationIdx += 1;
                continue;
            }

            if (token === directionRule.southNode && southIdx === -1) {
                southIdx = currentStationIdx;
            }
            if (token === directionRule.northNode && northIdx === -1) {
                northIdx = currentStationIdx;
            }
            if (southIdx !== -1 && northIdx !== -1) {
                return southIdx < northIdx ? 'Northbound' : 'Southbound';
            }

            currentStationIdx += 1;
        }
    }

    return '';
};

// panelTripDetailThroughServiceEndpointResolver.js
const defaultToText_panelTripDetailThroughServiceEndpointResolver = (value) => String(value ?? '').trim();

const getFirstStationId_panelTripDetailThroughServiceEndpointResolver = (value, toText = defaultToText_panelTripDetailThroughServiceEndpointResolver) => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    for (const item of list) {
        const stationId = toText(item);
        if (stationId) return stationId;
    }
    return '';
};

export const getPanelTripDetailStationIds = (value, {
    toText = defaultToText_panelTripDetailThroughServiceEndpointResolver
} = {}) => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return Array.from(new Set(list.map((item) => toText(item)).filter(Boolean)));
};

const getTripId_panelTripDetailThroughServiceEndpointResolver = (trip, toText = defaultToText_panelTripDetailThroughServiceEndpointResolver) => {
    const id = toText(trip?.id);
    return id || null;
};

export const resolvePanelTripDetailThroughServiceEndpointIds = async ({
    trip = null,
    loadTripByRefId = async () => null,
    toText = defaultToText_panelTripDetailThroughServiceEndpointResolver
} = {}) => {
    const visited = new Set();

    let originId = getFirstStationId_panelTripDetailThroughServiceEndpointResolver(trip?.os, toText);
    let cursor = trip;
    while (cursor) {
        const cursorId = getTripId_panelTripDetailThroughServiceEndpointResolver(cursor, toText);
        if (cursorId) {
            if (visited.has(cursorId)) break;
            visited.add(cursorId);
        }

        const refs = Array.isArray(cursor?.pt) ? cursor.pt : (cursor?.pt ? [cursor.pt] : []);
        const refId = toText(refs?.[0]);
        if (!refId) break;

        const previousTrip = await loadTripByRefId(refId);
        if (!previousTrip) break;

        const previousOrigin = getFirstStationId_panelTripDetailThroughServiceEndpointResolver(previousTrip?.os, toText);
        if (previousOrigin) originId = previousOrigin;
        cursor = previousTrip;
    }

    const followTerminalByNextRef = async ({
        startRefId,
        fallbackTerminalId
    } = {}) => {
        const seen = new Set();
        let terminalId = toText(fallbackTerminalId);
        let refId = toText(startRefId);

        while (refId) {
            if (seen.has(refId)) break;
            seen.add(refId);

            const nextTrip = await loadTripByRefId(refId);
            if (!nextTrip) break;

            const nextDs = getPanelTripDetailStationIds(nextTrip?.ds, { toText });
            if (nextDs.length && (!terminalId || !nextDs.includes(terminalId))) {
                terminalId = nextDs[0];
            }

            const nextRefs = Array.isArray(nextTrip?.nt) ? nextTrip.nt : (nextTrip?.nt ? [nextTrip.nt] : []);
            refId = toText(nextRefs?.[0]);
        }

        return terminalId;
    };

    visited.clear();
    const dsList = getPanelTripDetailStationIds(trip?.ds, { toText });
    const ntRefs = (Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []))
        .map((item) => toText(item))
        .filter(Boolean);

    let terminalIds = [];

    if (dsList.length >= 2) {
        const resolved = [];
        for (let index = 0; index < dsList.length; index += 1) {
            const fallbackTerminalId = dsList[index];
            const startRefId = ntRefs[index] || '';
            const traced = await followTerminalByNextRef({
                startRefId,
                fallbackTerminalId
            });
            if (traced) resolved.push(traced);
            else if (fallbackTerminalId) resolved.push(fallbackTerminalId);
        }
        terminalIds = Array.from(new Set(resolved.filter(Boolean)));
    } else {
        let terminalId = getFirstStationId_panelTripDetailThroughServiceEndpointResolver(dsList, toText);
        cursor = trip;
        while (cursor) {
            const cursorId = getTripId_panelTripDetailThroughServiceEndpointResolver(cursor, toText);
            if (cursorId) {
                if (visited.has(cursorId)) break;
                visited.add(cursorId);
            }

            const refs = Array.isArray(cursor?.nt) ? cursor.nt : (cursor?.nt ? [cursor.nt] : []);
            const refId = toText(refs?.[0]);
            if (!refId) break;

            const nextTrip = await loadTripByRefId(refId);
            if (!nextTrip) break;

            const nextTerminal = getFirstStationId_panelTripDetailThroughServiceEndpointResolver(nextTrip?.ds, toText);
            if (nextTerminal) terminalId = nextTerminal;
            cursor = nextTrip;
        }
        terminalIds = terminalId ? [terminalId] : [];
    }

    const terminalId = terminalIds[0] || '';
    return { originId, terminalId, terminalIds };
};

// panelTripLookupResolver.js
const defaultToText_panelTripLookupResolver = (value) => String(value ?? '').trim();

export const findPanelTripByKey = async ({
    lineId = '',
    tripKey = '',
    currentLineGroupByMainId = new Map(),
    currentServiceDay = '',
    getRefLineId = () => '',
    loadTimetableForLineId = async () => null,
    parseTripServiceDayFromId = () => '',
    toText = defaultToText_panelTripLookupResolver
} = {}) => {
    const key = toText(tripKey);
    if (!key) return null;

    const normalizedLineId = toText(lineId);
    const grouped = currentLineGroupByMainId instanceof Map
        ? currentLineGroupByMainId.get(normalizedLineId)
        : null;
    const candidateLineIds = Array.from(new Set([
        toText(getRefLineId(key)),
        normalizedLineId,
        ...((Array.isArray(grouped) ? grouped : [])
            .map((value) => toText(value))
            .filter(Boolean))
    ].filter(Boolean)));
    if (!candidateLineIds.length) return null;

    let fallback = null;
    for (const candidateLineId of candidateLineIds) {
        const data = await loadTimetableForLineId(candidateLineId);
        const list = Array.isArray(data) ? data : [];
        if (!list.length) continue;

        const candidates = list.filter((trip) => {
            const id = toText(trip?.id);
            const tkey = toText(trip?.t);
            if (id === key || tkey === key) return true;
            return id ? id.startsWith(`${key}.`) : false;
        });
        if (!candidates.length) continue;

        const withDay = candidates.find((trip) => parseTripServiceDayFromId(trip?.id) === currentServiceDay);
        if (withDay) return withDay;
        if (!fallback) fallback = candidates[0] || null;
    }

    return fallback;
};

// panelTripDetailBranchRuntime.js
const defaultToText_panelTripDetailBranchRuntime = (value) => String(value ?? '').trim();

export const resolvePanelTripDetailBranchRefIds = async ({
    refIds,
    token,
    key,
    resolveFirstMultiRefsAlongChain = async () => [],
    isTokenCurrent = () => true,
    toText = defaultToText_panelTripDetailBranchRuntime
} = {}) => {
    const ids = Array.isArray(refIds) ? refIds.map((value) => toText(value)).filter(Boolean) : [];
    if (ids.length !== 1) return ids;
    const found = await resolveFirstMultiRefsAlongChain(ids[0], token, key);
    if (!isTokenCurrent()) return null;
    return Array.isArray(found) && found.length >= 2 ? found : ids;
};

export const derivePanelTripDetailBranchRuntime = ({
    ntBranchLanes,
    ptBranchLanes
} = {}) => {
    const ntLanes = Array.isArray(ntBranchLanes) ? ntBranchLanes : [];
    const ptLanes = Array.isArray(ptBranchLanes) ? ptBranchLanes : [];
    const hasNtBranch = ntLanes.length >= 2;
    const hasPtBranch = ptLanes.length >= 2;
    const activeBranchLanes = hasNtBranch ? ntLanes : (hasPtBranch ? ptLanes : []);
    return {
        activeBranchLanes,
        branchCount: activeBranchLanes.length,
        branchMode: hasNtBranch ? 'split' : (hasPtBranch ? 'merge' : '')
    };
};

// panelTripDetailBranchMainFlow.js
const defaultToText_panelTripDetailBranchMainFlow = (value) => String(value ?? '').trim();

export const preparePanelTripDetailBranchMainFlow = ({
    activeBranchLanes = [],
    buildLineDescriptor = () => null,
    currentLineDesc = null,
    fallbackLineId = '',
    pickPrimaryLaneIndex = () => 0,
    segmentsWithPast = [],
    toText = defaultToText_panelTripDetailBranchMainFlow,
    tripLineId = ''
} = {}) => {
    const mainSegWithPast = (Array.isArray(segmentsWithPast) ? segmentsWithPast : [])
        .find((segment) => segment?.kind === 'main') || null;
    const mainRows = Array.isArray(mainSegWithPast?.rows) ? mainSegWithPast.rows : [];
    const resolvedMainLineId = toText(tripLineId) || toText(fallbackLineId);
    const mainDescriptor = currentLineDesc || buildLineDescriptor(resolvedMainLineId);

    const lanes = Array.isArray(activeBranchLanes) ? activeBranchLanes : [];
    const primaryLaneIndex = pickPrimaryLaneIndex(lanes, resolvedMainLineId);
    const orderedLanes = [
        lanes[primaryLaneIndex],
        ...lanes.filter((_, index) => index !== primaryLaneIndex)
    ].filter(Boolean);

    return {
        mainDescriptor,
        mainRows,
        primaryLane: orderedLanes[0] || null,
        secondaryLanes: orderedLanes.slice(1)
    };
};

// panelTripDetailBranchLaneBuilder.js
const defaultToText_panelTripDetailBranchLaneBuilder = (value) => String(value ?? '').trim();

export const buildPanelTripDetailBranchLaneFromChain = ({
    chainTrips,
    kind,
    sourceRefId,
    buildRowsForTrip = () => [],
    mergeStops = (left) => left,
    getTripLineId = () => '',
    buildLineDescriptor = () => null,
    buildRefLineDescriptor = () => null,
    getTripTypeName = () => '',
    getTripTypeColor = () => '',
    trainTypesIndex,
    trainTypeColorIndex,
    toText = defaultToText_panelTripDetailBranchLaneBuilder
} = {}) => {
    const chain = Array.isArray(chainTrips) ? chainTrips : [];
    if (!chain.length) return null;

    let laneRows = [];
    const lanePreviewSegments = [];

    for (const laneTrip of chain) {
        const rows = (Array.isArray(buildRowsForTrip(laneTrip)) ? buildRowsForTrip(laneTrip) : []).map((stop) => ({
            ...stop,
            seg: kind,
            isMain: false
        }));

        const laneStationIds = rows.map((row) => toText(row?.stationId)).filter(Boolean);
        if (laneStationIds.length >= 2) {
            lanePreviewSegments.push({
                kind,
                lineId: toText(getTripLineId(laneTrip)),
                r: toText(getTripLineId(laneTrip)),
                d: toText(laneTrip?.d),
                stationIds: laneStationIds,
                typeColor: toText(getTripTypeColor(laneTrip, trainTypeColorIndex))
            });
        }

        laneRows = mergeStops(laneRows, rows);
    }

    const firstTrip = chain[0] || null;
    return {
        kind,
        lineId: getTripLineId(firstTrip),
        sourceRefId,
        d: toText(firstTrip?.d),
        descriptor: buildLineDescriptor(getTripLineId(firstTrip)) || buildRefLineDescriptor(sourceRefId),
        typeName: getTripTypeName(firstTrip, trainTypesIndex),
        typeColor: getTripTypeColor(firstTrip, trainTypeColorIndex),
        rows: laneRows,
        previewSegments: lanePreviewSegments
    };
};

// panelTripDetailBranchLaneCollector.js
const defaultToText_panelTripDetailBranchLaneCollector = (value) => String(value ?? '').trim();

export const collectPanelTripDetailBranchLanesFromRefs = async ({
    refIds = [],
    kind = '',
    collectRefChainTripsFromRef = async () => [],
    isTokenCurrent = () => true,
    buildRowsForTrip = () => [],
    mergeStops = (left) => left,
    getTripLineId = () => '',
    buildLineDescriptor = () => null,
    buildRefLineDescriptor = () => null,
    getTripTypeName = () => '',
    getTripTypeColor = () => '',
    trainTypesIndex,
    trainTypeColorIndex,
    toText = defaultToText_panelTripDetailBranchLaneCollector
} = {}) => {
    const ids = Array.isArray(refIds) ? refIds.map((value) => toText(value)).filter(Boolean) : [];
    const lanes = [];

    for (let index = 0; index < ids.length; index += 1) {
        const sourceRefId = ids[index];
        const chainTrips = await collectRefChainTripsFromRef(sourceRefId, kind);
        if (!isTokenCurrent()) return null;

        const chain = Array.isArray(chainTrips) ? chainTrips : [];
        if (!chain.length) continue;

        const lane = buildPanelTripDetailBranchLaneFromChain({
            chainTrips: chain,
            kind,
            sourceRefId,
            buildRowsForTrip,
            mergeStops,
            getTripLineId,
            buildLineDescriptor,
            buildRefLineDescriptor,
            getTripTypeName,
            getTripTypeColor,
            trainTypesIndex,
            trainTypeColorIndex,
            toText
        });
        if (lane) lanes.push(lane);
    }

    return lanes;
};

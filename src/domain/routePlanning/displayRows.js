import { getPairMapValue } from '../alternateLineMembership.js';

const normalizeText = (value) => String(value ?? '').trim();

export const compactStationIds = (stationIds) => {
    const out = [];
    for (const rawId of Array.isArray(stationIds) ? stationIds : []) {
        const stationId = normalizeText(rawId);
        if (!stationId) continue;
        if (out.length && out[out.length - 1] === stationId) continue;
        out.push(stationId);
    }
    return out;
};

export const rowsToCompactStationIds = (rows) => compactStationIds(
    (Array.isArray(rows) ? rows : []).map((row) => row?.stationId)
);

export const buildRailPreviewSegment = ({
    direction = null,
    lineId,
    stationIds,
    throughServiceColor = null,
    typeColor = null
} = {}) => {
    const resolvedLineId = normalizeText(lineId);
    const compactIds = compactStationIds(stationIds);
    if (!resolvedLineId || compactIds.length < 2) return null;

    const segment = {
        kind: 'main',
        lineId: resolvedLineId,
        stationIds: compactIds
    };
    const resolvedDirection = normalizeText(direction);
    const resolvedThroughServiceColor = normalizeText(throughServiceColor);
    const resolvedTypeColor = normalizeText(typeColor);
    if (resolvedDirection) segment.d = resolvedDirection;
    if (resolvedThroughServiceColor) segment.throughServiceColor = resolvedThroughServiceColor;
    if (resolvedTypeColor) segment.typeColor = resolvedTypeColor;
    return segment;
};

export const buildTripPreviewPayloadFromSegments = ({
    displayPlan,
    row,
    segments,
    toHHMM
} = {}) => {
    const list = Array.isArray(segments) ? segments.filter(Boolean) : [];
    if (!list.length) return null;

    const legs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
    const firstSeg = list[0];
    const lastSeg = list[list.length - 1];
    const firstLeg = legs[0] || null;
    const formatTime = typeof toHHMM === 'function' ? toHHMM : (value) => normalizeText(value);

    return {
        tripKey: normalizeText(firstLeg?.tripKey || `${formatTime(displayPlan?.firstDepMs)}-${formatTime(displayPlan?.arrivalMs)}`),
        selectedLineId: normalizeText(firstSeg?.lineId),
        mainLineId: normalizeText(firstSeg?.lineId),
        originStationId: normalizeText(row?.originStationId || firstSeg?.stationIds?.[0]),
        mainTerminalStationId: normalizeText(firstSeg?.stationIds?.[firstSeg.stationIds.length - 1]),
        terminalStationId: normalizeText(lastSeg?.stationIds?.[lastSeg.stationIds.length - 1]),
        typeName: normalizeText(firstLeg?.typeName || '\u666e\u901a'),
        typeColor: normalizeText(firstSeg?.typeColor || firstLeg?.typeColor || '') || null,
        hasNt: false,
        fitMode: 'preview',
        segments: list
    };
};

const getStationTailToken = (stationId) => {
    const parts = normalizeText(stationId).split('.').map(normalizeText).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
};

export const resolveAlternateRoutePlanningStationIdentity = ({
    alternateLineMembership = null,
    hasStationId = () => false,
    lineId = '',
    stationId = ''
} = {}) => {
    const sourceLineId = normalizeText(lineId);
    const sourceStationId = normalizeText(stationId);
    if (!sourceLineId || !sourceStationId) return null;

    const alternateLineId = getPairMapValue(
        alternateLineMembership?.alternateLineIdByLineStationId,
        sourceLineId,
        sourceStationId
    );
    if (!alternateLineId) return null;

    const directStationId = getPairMapValue(
        alternateLineMembership?.alternateStationIdByLineStationId,
        sourceLineId,
        sourceStationId
    );
    if (directStationId) return { lineId: alternateLineId, stationId: directStationId };

    const tail = getStationTailToken(sourceStationId);
    const sameTailStationId = tail ? `${alternateLineId}.${tail}` : '';
    if (sameTailStationId && hasStationId(sameTailStationId)) {
        return { lineId: alternateLineId, stationId: sameTailStationId };
    }

    return null;
};

const pushAlternatePreviewPairSegment = (segments, baseSegment, lineId, stationIds) => {
    const resolvedLineId = normalizeText(lineId);
    const ids = compactStationIds(stationIds);
    if (!resolvedLineId || !ids.length) return;

    const prev = segments[segments.length - 1];
    if (
        prev
        && normalizeText(prev.lineId) === resolvedLineId
        && normalizeText(prev.d) === normalizeText(baseSegment?.d)
        && normalizeText(prev.throughServiceColor) === normalizeText(baseSegment?.throughServiceColor)
        && normalizeText(prev.typeColor) === normalizeText(baseSegment?.typeColor)
        && normalizeText(prev.stationIds?.[prev.stationIds.length - 1]) === ids[0]
    ) {
        prev.stationIds.push(...ids.slice(1));
        return;
    }

    segments.push({
        ...(baseSegment || {}),
        lineId: resolvedLineId,
        stationIds: ids
    });
};

export const rewriteTripPreviewSegmentsForAlternateMembership = ({
    alternateLineMembership = null,
    hasStationId = () => false,
    segments = []
} = {}) => {
    if (!alternateLineMembership) return Array.isArray(segments) ? segments : [];

    const out = [];
    for (const segment of Array.isArray(segments) ? segments : []) {
        const lineId = normalizeText(segment?.lineId);
        const stationIds = compactStationIds(segment?.stationIds);
        if (!lineId || stationIds.length < 2) {
            if (segment) out.push(segment);
            continue;
        }

        let currentLineId = '';
        let currentStationIds = [];
        const flushCurrent = () => {
            pushAlternatePreviewPairSegment(out, segment, currentLineId, currentStationIds);
            currentLineId = '';
            currentStationIds = [];
        };

        for (const stationId of stationIds) {
            const alternate = resolveAlternateRoutePlanningStationIdentity({
                alternateLineMembership,
                hasStationId,
                lineId,
                stationId
            });
            const nextLineId = normalizeText(alternate?.lineId || lineId);
            const nextStationId = normalizeText(alternate?.stationId || stationId);
            if (!nextLineId || !nextStationId) continue;
            if (currentLineId && currentLineId !== nextLineId) flushCurrent();
            currentLineId = nextLineId;
            currentStationIds.push(nextStationId);
        }
        flushCurrent();
    }

    return out;
};

export const calculateDisplayPlanTiming = ({ expandedLegs, plan, row } = {}) => {
    const legs = Array.isArray(expandedLegs) ? expandedLegs : [];
    const firstLeg = legs[0] || null;
    const lastLeg = legs[legs.length - 1] || null;

    const firstDepMs = Number.isFinite(Number(firstLeg?.depMs))
        ? Number(firstLeg.depMs)
        : (Number.isFinite(Number(plan?.firstDepMs)) ? Number(plan.firstDepMs) : null);
    let arrivalMs = Number.isFinite(Number(lastLeg?.arrMs))
        ? Number(lastLeg.arrMs)
        : (Number.isFinite(Number(plan?.arrivalMs)) ? Number(plan.arrivalMs) : null);

    const extraDestWalkMin = Number.isFinite(Number(row?.__walkDestinationMinutes)) ? Number(row.__walkDestinationMinutes) : 0;
    if (extraDestWalkMin > 0 && Number.isFinite(arrivalMs)) {
        arrivalMs += Math.round(extraDestWalkMin) * 60000;
    }

    const baseDepartureMs = Number.isFinite(Number(row?.baseDepartureMs))
        ? Number(row.baseDepartureMs)
        : (Number.isFinite(Number(plan?.baseDepartureMs)) ? Number(plan.baseDepartureMs) : null);

    let durationMs = (Number.isFinite(baseDepartureMs) && Number.isFinite(arrivalMs))
        ? (arrivalMs - baseDepartureMs)
        : ((Number.isFinite(firstDepMs) && Number.isFinite(arrivalMs)) ? (arrivalMs - firstDepMs) : plan?.durationMs);

    const extraOriginWalkMin = Number.isFinite(Number(row?.__walkOriginMinutes)) ? Number(row.__walkOriginMinutes) : 0;
    if (Number.isFinite(durationMs)) {
        let extraMs = 0;
        if (extraOriginWalkMin > 0) extraMs += Math.round(extraOriginWalkMin) * 60000;
        if (extraDestWalkMin > 0) extraMs += Math.round(extraDestWalkMin) * 60000;
        if (extraMs > 0) durationMs = Number(durationMs) + extraMs;
    }

    return {
        arrivalMs,
        durationMs,
        firstDepMs
    };
};

export const countDisplayPlanTransfers = ({
    expandedLegs,
    isThroughLegPairByMeta,
    sections
} = {}) => {
    const sectionList = Array.isArray(sections) ? sections : [];
    if (sectionList.length) return Math.max(0, sectionList.length - 1);

    const legs = Array.isArray(expandedLegs) ? expandedLegs : [];
    const isThrough = typeof isThroughLegPairByMeta === 'function'
        ? isThroughLegPairByMeta
        : () => false;
    let transfers = 0;
    for (let i = 0; i < legs.length - 1; i += 1) {
        if (!isThrough({ currentLeg: legs[i], nextLeg: legs[i + 1] })) transfers += 1;
    }
    return transfers;
};

export const buildDisplayPlanFromExpandedLegs = ({
    expandedLegs,
    isThroughLegPairByMeta,
    plan,
    row,
    sections
} = {}) => {
    const timing = calculateDisplayPlanTiming({ expandedLegs, plan, row });
    const sectionList = Array.isArray(sections) ? sections : [];
    return {
        ...(plan || {}),
        legs: Array.isArray(expandedLegs) ? expandedLegs : [],
        sections: sectionList,
        firstDepMs: Number.isFinite(timing.firstDepMs) ? timing.firstDepMs : plan?.firstDepMs,
        arrivalMs: Number.isFinite(timing.arrivalMs) ? timing.arrivalMs : plan?.arrivalMs,
        durationMs: timing.durationMs,
        transfers: countDisplayPlanTransfers({
            expandedLegs,
            isThroughLegPairByMeta,
            sections: sectionList
        })
    };
};

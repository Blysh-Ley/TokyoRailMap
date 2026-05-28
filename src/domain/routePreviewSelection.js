const toText = (value) => String(value ?? '').trim();

export const resolveTripPreviewPayloadSource = (payload) => {
    return toText(payload?.previewSource || payload?.__previewSource || payload?.source);
};

export const normalizeTripPreviewSegment = (segment) => {
    const lineId = toText(segment?.lineId);
    const stationIds = Array.isArray(segment?.stationIds)
        ? segment.stationIds.map(toText).filter(Boolean)
        : [];
    return { lineId, stationIds };
};

export const normalizeTripPreviewSegments = (segments) => {
    return Array.isArray(segments)
        ? segments.map(normalizeTripPreviewSegment)
        : [];
};

export const normalizeTripPreviewVirtualTrips = (payload) => {
    const virtualTrips = Array.isArray(payload?.virtualTrips) ? payload.virtualTrips : [];
    return virtualTrips.map((trip) => ({
        ...trip,
        segments: normalizeTripPreviewSegments(trip?.segments)
    }));
};

export const buildTripPreviewSegmentsKey = (segments) => {
    return normalizeTripPreviewSegments(segments)
        .map(({ lineId, stationIds }) => {
            if (!lineId || stationIds.length < 2) return '';
            return `${lineId}:${stationIds.join('>')}`;
        })
        .filter(Boolean)
        .join('||');
};

export const buildTripPreviewVirtualTripsKey = (payload) => {
    return normalizeTripPreviewVirtualTrips(payload)
        .map((trip) => buildTripPreviewSegmentsKey(trip?.segments))
        .filter(Boolean)
        .join('~~~');
};

export const getTripPreviewLineIdFromPayload = (payload) => {
    const segments = normalizeTripPreviewSegments(payload?.segments);
    const lineIdFromSegments = segments.find((segment) => segment.lineId)?.lineId || '';
    return toText(payload?.selectedLineId || payload?.mainLineId || lineIdFromSegments);
};

export const buildTripPreviewSelectionKey = (payload) => {
    const source = resolveTripPreviewPayloadSource(payload) || 'default';
    const explicitPreviewKey = toText(payload?.previewKey || payload?.__previewKey);
    if (explicitPreviewKey) {
        return `${source}||preview||${explicitPreviewKey}`;
    }

    const lineId = getTripPreviewLineIdFromPayload(payload);
    const tripKey = toText(payload?.tripKey)
        || buildTripPreviewSegmentsKey(payload?.segments)
        || buildTripPreviewVirtualTripsKey(payload);

    if (!tripKey) return '';
    return `${source}||${lineId || 'unknown-line'}||${tripKey}`;
};

export const buildEndpointStationIdSetFromPayloadList = (payloadList) => {
    const out = new Set();
    const list = Array.isArray(payloadList) ? payloadList : [];

    for (const payload of list) {
        const segments = normalizeTripPreviewSegments(payload?.segments)
            .filter((segment) => segment.stationIds.length);
        if (!segments.length) continue;

        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const startId = firstSeg.stationIds[0] || '';
        const endId = lastSeg.stationIds[lastSeg.stationIds.length - 1] || '';

        if (startId) out.add(startId);
        if (endId) out.add(endId);
    }

    return out;
};

export const normalizeDirPreviewPayload = (payload) => {
    const lineId = toText(payload?.lineId);
    const fitMode = toText(payload?.fitMode) || 'preview';
    const originIds = Array.isArray(payload?.originStationIds)
        ? payload.originStationIds.map(toText).filter(Boolean)
        : [];
    const terminalIds = Array.isArray(payload?.terminalStationIds)
        ? payload.terminalStationIds.map(toText).filter(Boolean)
        : [];
    const currentIds = Array.isArray(payload?.currentStationIds)
        ? payload.currentStationIds.map(toText).filter(Boolean)
        : [];
    const sourceLineIds = Array.isArray(payload?.sourceLineIds)
        ? payload.sourceLineIds.map(toText).filter(Boolean)
        : [];

    return {
        lineId,
        fitMode,
        originIds,
        terminalIds,
        currentIds,
        sourceLineIds,
        stationIds: new Set([...originIds, ...terminalIds, ...currentIds])
    };
};

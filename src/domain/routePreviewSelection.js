const toText = (value) => String(value ?? '').trim();

export const resolveTripPreviewPayloadSource = (payload) => {
    return toText(payload?.previewSource || payload?.__previewSource || payload?.source);
};

export const normalizeTripPreviewSegment = (segment) => {
    const lineId = toText(segment?.lineId);
    const geometryLineId = toText(segment?.geometryLineId || segment?.geometry_line_id);
    const offsetLineId = toText(segment?.offsetLineId || segment?.line_offset_id);
    const stationIds = Array.isArray(segment?.stationIds)
        ? segment.stationIds.map(toText).filter(Boolean)
        : [];
    return {
        lineId,
        ...(geometryLineId ? { geometryLineId } : {}),
        ...(offsetLineId ? { offsetLineId } : {}),
        stationIds
    };
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

export const toCoordKey = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return '';
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
    return `${lng.toFixed(6)},${lat.toFixed(6)}`;
};

export const buildLineCoordsCanonicalKey = (coords) => {
    const arr = Array.isArray(coords) ? coords.map((coord) => toCoordKey(coord)).filter(Boolean) : [];
    if (arr.length < 2) return '';
    const fwd = arr.join('>');
    const rev = arr.slice().reverse().join('>');
    return fwd <= rev ? fwd : rev;
};

export const buildTripPreviewLineFeatureDedupKey = (feature) => {
    const role = toText(feature?.properties?.role || 'line');
    const lineId = toText(feature?.properties?.lineId);
    const geom = feature?.geometry;
    if (!geom || geom.type !== 'LineString') return '';
    const pathKey = buildLineCoordsCanonicalKey(geom.coordinates);
    if (!pathKey) return '';
    return `${role}||${lineId}||${pathKey}`;
};

export const mergeTripPreviewBBox = (current, next) => {
    const a = current;
    const b = next;
    const isValid = (bbox) => bbox
        && [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].every(Number.isFinite);
    if (!isValid(a)) return isValid(b) ? { ...b } : null;
    if (!isValid(b)) return { ...a };
    return {
        minLng: Math.min(a.minLng, b.minLng),
        minLat: Math.min(a.minLat, b.minLat),
        maxLng: Math.max(a.maxLng, b.maxLng),
        maxLat: Math.max(a.maxLat, b.maxLat)
    };
};

export const buildTripPreviewAggregateFromPayloadList = ({
    payloadList,
    buildTripPreviewFeatures,
    buildLineFeatureDedupKey = buildTripPreviewLineFeatureDedupKey
} = {}) => {
    const list = Array.isArray(payloadList) ? payloadList : [];
    const lineFeatureByKey = new Map();
    const stopFeatureByStationId = new Map();
    const lineIds = new Set();
    const stopIds = new Set();
    let bbox = null;
    let startStationId = '';
    let endStationId = '';

    for (const payload of list) {
        const built = buildTripPreviewFeatures?.(payload);
        const lineFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features : [];
        const stopFeatures = Array.isArray(built?.stopFc?.features) ? built.stopFc.features : [];

        if (!startStationId) startStationId = toText(built?.startStationId);
        const nextEndStationId = toText(built?.endStationId);
        if (nextEndStationId) endStationId = nextEndStationId;

        for (const feature of lineFeatures) {
            const key = buildLineFeatureDedupKey?.(feature) || '';
            if (!key || lineFeatureByKey.has(key)) continue;
            lineFeatureByKey.set(key, feature);
        }

        for (const feature of stopFeatures) {
            const stationId = toText(feature?.properties?.id);
            if (!stationId || stopFeatureByStationId.has(stationId)) continue;
            stopFeatureByStationId.set(stationId, feature);
        }

        const builtLineIds = built?.lineIds instanceof Set ? built.lineIds : null;
        if (builtLineIds) {
            for (const id of builtLineIds) {
                const value = toText(id);
                if (value) lineIds.add(value);
            }
        }

        const builtStopIds = built?.stopIds instanceof Set ? built.stopIds : null;
        if (builtStopIds) {
            for (const id of builtStopIds) {
                const value = toText(id);
                if (value) stopIds.add(value);
            }
        }

        bbox = mergeTripPreviewBBox(bbox, built?.bbox);
    }

    return {
        lineFc: { type: 'FeatureCollection', features: Array.from(lineFeatureByKey.values()) },
        stopFc: { type: 'FeatureCollection', features: Array.from(stopFeatureByStationId.values()) },
        lineIds,
        stopIds,
        startStationId,
        endStationId,
        bbox
    };
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

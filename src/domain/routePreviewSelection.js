const toText = (value) => String(value ?? '').trim();

export const resolveTripPreviewPayloadSource = (payload) => {
    return toText(payload?.previewSource || payload?.__previewSource || payload?.source);
};

export const normalizeTripPreviewSegment = (segment) => {
    const lineId = toText(segment?.lineId);
    const r = toText(segment?.r || segment?.routeLineId || segment?.railwayId);
    const geometryLineId = toText(segment?.geometryLineId || segment?.geometry_line_id);
    const offsetLineId = toText(segment?.offsetLineId || segment?.line_offset_id);
    const stationIds = Array.isArray(segment?.stationIds)
        ? segment.stationIds.map(toText).filter(Boolean)
        : [];
    return {
        lineId,
        ...(r ? { r } : {}),
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
        .map(({ lineId, r, geometryLineId, offsetLineId, stationIds }) => {
            const lineKey = r || geometryLineId || offsetLineId || lineId;
            if (!lineKey || stationIds.length < 2) return '';
            return `${lineKey}:${stationIds.join('>')}`;
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

export const buildTripPreviewLineFeatureCollisionKey = (feature) => {
    const role = toText(feature?.properties?.role || 'line');
    const geom = feature?.geometry;
    if (!geom || geom.type !== 'LineString') return '';
    const pathKey = buildLineCoordsCanonicalKey(geom.coordinates);
    if (!pathKey) return '';
    return `${role}||${pathKey}`;
};

const buildLineFeatureItemContextKey = (item) => {
    return toText(item?.source);
};

const cloneLineFeatureWithOffset = (feature, lineOffsetUnits, laneIndex, laneCount) => ({
    ...(feature || {}),
    properties: {
        ...(feature?.properties || {}),
        line_offset_units: lineOffsetUnits,
        line_offset_collision_lane: laneIndex,
        line_offset_collision_count: laneCount
    }
});

const cloneLineFeatureWithSource = (feature, source) => {
    const value = toText(source);
    if (!value) return feature;
    return {
        ...(feature || {}),
        properties: {
            ...(feature?.properties || {}),
            line_offset_collision_source: value
        }
    };
};

const buildCompactCollisionLaneOffsets = (count, separationUnits) => {
    const n = Math.max(0, Math.trunc(Number(count) || 0));
    if (!n) return [];

    const step = Number(separationUnits) || 0;
    const out = [];
    for (let i = 0; i < n; i += 1) {
        if (i === 0) {
            out.push(0);
            continue;
        }
        const magnitude = Math.ceil(i / 2) * step;
        const direction = i % 2 === 1 ? 1 : -1;
        out.push(magnitude * direction);
    }
    return out;
};

export const applyTripPreviewCollisionLaneOffsets = (features, options = {}) => {
    const list = Array.isArray(features) ? features : [];
    if (list.length < 2) return list.slice();

    const minSeparationUnits = Number.isFinite(options?.minSeparationUnits)
        ? Math.max(0, Number(options.minSeparationUnits))
        : 1;
    if (!minSeparationUnits) return list.slice();

    const groups = new Map();
    for (let index = 0; index < list.length; index += 1) {
        const feature = list[index];
        const key = buildTripPreviewLineFeatureCollisionKey(feature);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ feature, index });
    }

    const out = list.slice();
    for (const group of groups.values()) {
        if (!Array.isArray(group) || group.length < 2) continue;

        const laneOffsets = buildCompactCollisionLaneOffsets(group.length, minSeparationUnits);

        for (let i = 0; i < group.length; i += 1) {
            out[group[i].index] = cloneLineFeatureWithOffset(
                group[i].feature,
                laneOffsets[i] || 0,
                i,
                group.length
            );
        }
    }

    return out;
};

export const aggregateTripPreviewLineFeatureItems = ({
    items,
    buildLineFeatureDedupKey = buildTripPreviewLineFeatureDedupKey
} = {}) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];

    const sourceSetByCollisionKey = new Map();
    for (const item of list) {
        const feature = item?.feature;
        const collisionKey = buildTripPreviewLineFeatureCollisionKey(feature);
        const baseKey = buildLineFeatureDedupKey?.(feature) || '';
        if (!collisionKey || !baseKey) continue;
        const contextKey = buildLineFeatureItemContextKey(item);
        if (!contextKey) continue;
        if (!sourceSetByCollisionKey.has(collisionKey)) sourceSetByCollisionKey.set(collisionKey, new Set());
        sourceSetByCollisionKey.get(collisionKey).add(contextKey);
    }

    const lineFeatureByKey = new Map();
    for (const item of list) {
        const feature = item?.feature;
        const baseKey = buildLineFeatureDedupKey?.(feature) || '';
        if (!baseKey) continue;

        const collisionKey = buildTripPreviewLineFeatureCollisionKey(feature);
        const hasCrossSourceCollision = collisionKey
            && (sourceSetByCollisionKey.get(collisionKey)?.size || 0) > 1;
        const contextKey = buildLineFeatureItemContextKey(item);
        const key = collisionKey
            ? (hasCrossSourceCollision && contextKey
                ? `${collisionKey}||ctx:${contextKey}`
                : collisionKey)
            : baseKey;
        if (!key || lineFeatureByKey.has(key)) continue;
        lineFeatureByKey.set(key, cloneLineFeatureWithSource(feature, contextKey));
    }

    return applyTripPreviewCollisionLaneOffsets(Array.from(lineFeatureByKey.values()));
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

export const isTripPreviewEndpointProps = (props) => (
    Number(props?.is_preview_endpoint) === 1 || props?.is_preview_endpoint === true
);

export const markTripPreviewStopFeatureEndpoint = (feature) => ({
    ...(feature || {}),
    properties: {
        ...(feature?.properties || {}),
        is_preview_endpoint: 1
    }
});

export const buildTripPreviewAggregateFromPayloadList = ({
    payloadList,
    buildTripPreviewFeatures,
    buildLineFeatureDedupKey = buildTripPreviewLineFeatureDedupKey
} = {}) => {
    const list = Array.isArray(payloadList) ? payloadList : [];
    const lineFeatureItems = [];
    const stopFeatureByStationId = new Map();
    const lineIds = new Set();
    const stopIds = new Set();
    const pastStopIds = new Set();
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
        const builtEndpointIds = new Set();
        const builtStartStationId = toText(built?.startStationId);
        const builtEndStationId = toText(built?.endStationId);
        if (builtStartStationId) builtEndpointIds.add(builtStartStationId);
        if (builtEndStationId) builtEndpointIds.add(builtEndStationId);

        for (const feature of lineFeatures) {
            lineFeatureItems.push({
                feature,
                source: resolveTripPreviewPayloadSource(payload)
            });
        }

        for (const feature of stopFeatures) {
            const stationId = toText(feature?.properties?.id);
            if (!stationId) continue;
            if (feature?.properties?.isPast === true) pastStopIds.add(stationId);
            const isEndpoint = builtEndpointIds.has(stationId) || isTripPreviewEndpointProps(feature?.properties);
            if (stopFeatureByStationId.has(stationId)) {
                const current = stopFeatureByStationId.get(stationId);
                if (isEndpoint && !isTripPreviewEndpointProps(current?.properties)) {
                    stopFeatureByStationId.set(stationId, markTripPreviewStopFeatureEndpoint(current));
                }
                continue;
            }
            stopFeatureByStationId.set(
                stationId,
                isEndpoint ? markTripPreviewStopFeatureEndpoint(feature) : feature
            );
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

        const builtPastStopIds = built?.pastStopIds instanceof Set ? built.pastStopIds : null;
        if (builtPastStopIds) {
            for (const id of builtPastStopIds) {
                const value = toText(id);
                if (value) pastStopIds.add(value);
            }
        }

        bbox = mergeTripPreviewBBox(bbox, built?.bbox);
    }

    return {
        lineFc: {
            type: 'FeatureCollection',
            features: aggregateTripPreviewLineFeatureItems({
                items: lineFeatureItems,
                buildLineFeatureDedupKey
            })
        },
        stopFc: { type: 'FeatureCollection', features: Array.from(stopFeatureByStationId.values()) },
        lineIds,
        stopIds,
        pastStopIds,
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

const EMPTY_KEY = '__empty__';
const INIT_KEY = '__init__';

const toText = (value) => String(value ?? '').trim();

export const reachableStopsCircleRadiusMeters = (remainingMs) => {
    const maxMinutes = 20;
    const minMinutes = 5;
    const remainingMinutes = Math.max(minMinutes, Number(remainingMs) / 60000);
    const walkMinutes = Math.min(maxMinutes, remainingMinutes);
    return walkMinutes * 50;
};

const generateAbsoluteColorExpressionAbsolute = (countsArray) => {
    const fixedSteps = [0, 18, 36, 54, 72, 108, 180, 360];
    const steps = fixedSteps.length;
    const colors = [];
    for (let i = 0; i < steps; i += 1) {
        const ratio = i / (steps - 1);
        const h = Math.round(50 * (1 - ratio));
        const s = 100;
        const l = Math.round(80 - 30 * ratio);
        colors.push(`hsl(${h}, ${s}%, ${l}%)`);
    }

    const expression = ['interpolate', ['linear'], ['get', 'shiftCount']];
    for (let i = 0; i < steps; i += 1) {
        expression.push(fixedSteps[i], colors[i]);
    }
    return expression;
};

export const buildReachableStopsOverlayGeoJSON = ({
    payload = {},
    getStationCoord = () => null
} = {}) => {
    const reachableStops = payload?.reachableStops;
    const remainingMsByStop = payload?.remainingMsByStop instanceof Map
        ? payload.remainingMsByStop
        : new Map();

    const stopIds = Array.isArray(reachableStops)
        ? reachableStops
        : (reachableStops instanceof Set ? Array.from(reachableStops) : Object.keys(payload?.remainingMsByStop || {}));

    const features = [];
    const allShiftCounts = [];

    for (const rawStopId of stopIds) {
        const stopId = toText(rawStopId);
        if (!stopId) continue;

        const shiftsArray = remainingMsByStop.get(stopId);
        if (!Array.isArray(shiftsArray) || !shiftsArray.length) continue;

        const coord = getStationCoord(stopId);
        if (!Array.isArray(coord) || coord.length < 2) continue;

        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

        for (const shift of shiftsArray) {
            const remainingMs = Number(shift?.remainMs);
            const shiftCount = Number(shift?.count) || 0;
            if (!Number.isFinite(remainingMs) || remainingMs < 0) continue;

            if (shiftCount > 0) allShiftCounts.push(shiftCount);
            const radiusMeters = reachableStopsCircleRadiusMeters(remainingMs);
            const sortKey = (shiftCount * 100000) - radiusMeters;
            features.push({
                type: 'Feature',
                properties: {
                    id: stopId,
                    remainingMs,
                    radiusMeters,
                    shiftCount,
                    sortKey
                },
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            });
        }
    }

    features.sort((a, b) => {
        if (a.properties.shiftCount !== b.properties.shiftCount) {
            return a.properties.shiftCount - b.properties.shiftCount;
        }
        return b.properties.radiusMeters - a.properties.radiusMeters;
    });

    return {
        geojson: { type: 'FeatureCollection', features },
        dynamicColorExpression: generateAbsoluteColorExpressionAbsolute(allShiftCounts)
    };
};

export const getReachableStopsLabelIdSet = (geojson) => {
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    if (!features.length) return null;
    const out = new Set();
    for (const feature of features) {
        const sid = toText(feature?.properties?.id ?? feature?.id);
        if (sid) out.add(sid);
    }
    return out.size ? out : null;
};

export const getReachableStopsExtremeLabelIdSet = (geojson) => {
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    if (!features.length) return null;

    let east = null;
    let west = null;
    let north = null;
    let south = null;

    const pick = (current, candidate, cmp) => {
        if (!current) return candidate;
        const res = cmp(candidate, current);
        if (res > 0) return candidate;
        if (res < 0) return current;
        const aId = toText(candidate?.id);
        const bId = toText(current?.id);
        return aId && bId && aId < bId ? candidate : current;
    };

    for (const feature of features) {
        const coordinates = feature?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        const sid = toText(feature?.properties?.id ?? feature?.id);
        if (!sid) continue;
        const item = { id: sid, lng, lat };
        east = pick(east, item, (a, b) => a.lng - b.lng);
        west = pick(west, item, (a, b) => b.lng - a.lng);
        north = pick(north, item, (a, b) => a.lat - b.lat);
        south = pick(south, item, (a, b) => b.lat - a.lat);
    }

    const out = new Set();
    for (const item of [east, west, north, south]) {
        if (item?.id) out.add(toText(item.id));
    }
    return out.size ? out : null;
};

const buildVisibleKey = (geojson) => JSON.stringify(
    (Array.isArray(geojson?.features) ? geojson.features : []).map((feature) => [
        feature?.properties?.id,
        Math.round(Number(feature?.properties?.remainingMs) || 0),
        (feature?.geometry?.coordinates?.[0] || 0).toFixed(6),
        (feature?.geometry?.coordinates?.[1] || 0).toFixed(6)
    ])
);

export const createTravelSearchMapRuntime = ({
    mapEngine,
    overlayRenderer,
    getStationCoord = () => null,
    getStationLabels = () => [],
    createJourneyPickPinElement,
    onJourneyPickPinStationIdsChange = () => {},
    scheduleCollisionLayerRefresh = () => {}
} = {}) => {
    let reachableStopsOverlayVisibleKey = INIT_KEY;
    let reachableStopsLabelIds = null;
    let reachableStopsExtremeLabelIds = null;
    let lastReachableStopsPayload = null;
    let journeyPickOriginPin = null;
    let journeyPickDestinationPin = null;
    const journeyPickStationIdsByType = {
        origin: '',
        destination: ''
    };

    const notifyJourneyPickPinStationIdsChange = () => {
        try {
            onJourneyPickPinStationIdsChange({
                origin: journeyPickStationIdsByType.origin || '',
                destination: journeyPickStationIdsByType.destination || ''
            });
        } catch {
            // ignore
        }
    };

    const applyReachableStopsLabelPriorityBoost = (extremeIds) => {
        const stationLabels = getStationLabels?.();
        if (!Array.isArray(stationLabels) || !stationLabels.length) return;
        const set = extremeIds instanceof Set ? extremeIds : null;
        for (const item of stationLabels) {
            const sid = toText(item?.stationId || item?.props?.id);
            const boost = !!(sid && set && set.has(sid));
            item.collisionPriorityBoost = boost ? 1 : 0;
        }
    };

    const clearJourneyPickPin = (type = null) => {
        const pinType = toText(type).toLowerCase();
        if (!pinType || pinType === 'origin') {
            try { journeyPickOriginPin?.remove?.(); } catch { /* ignore */ }
            journeyPickOriginPin = null;
            journeyPickStationIdsByType.origin = '';
        }
        if (!pinType || pinType === 'destination') {
            try { journeyPickDestinationPin?.remove?.(); } catch { /* ignore */ }
            journeyPickDestinationPin = null;
            journeyPickStationIdsByType.destination = '';
        }
        notifyJourneyPickPinStationIdsChange();
    };

    const resolvePinCoordinate = ({ lngLat, stationId } = {}) => {
        const sid = toText(stationId);
        if (Array.isArray(lngLat) && lngLat.length >= 2) {
            const lng = Number(lngLat[0]);
            const lat = Number(lngLat[1]);
            if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
        } else if (lngLat && typeof lngLat === 'object') {
            const lng = Number(lngLat.lng ?? lngLat.lon ?? lngLat.longitude);
            const lat = Number(lngLat.lat ?? lngLat.latitude);
            if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
        }
        if (!sid) return null;
        const coord = getStationCoord(sid);
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    };

    const showJourneyPickPin = async ({ lngLat, stationId, type = 'origin' } = {}) => {
        const pinType = toText(type).toLowerCase();
        if (pinType !== 'origin' && pinType !== 'destination') return;
        const sid = toText(stationId);
        const coord = resolvePinCoordinate({ lngLat, stationId });

        clearJourneyPickPin(pinType);
        if (!coord) return;
        if (!mapEngine || typeof createJourneyPickPinElement !== 'function') return;

        try {
            const element = await createJourneyPickPinElement({ type: pinType });
            const marker = mapEngine.createMarker({ element, anchor: 'bottom', offset: [0, 0] })
                .setLngLat(coord);
            mapEngine.addMarker(marker);
            if (pinType === 'origin') journeyPickOriginPin = marker;
            else journeyPickDestinationPin = marker;
            journeyPickStationIdsByType[pinType] = sid;
            notifyJourneyPickPinStationIdsChange();
        } catch {
            // ignore
        }
    };

    const syncJourneyPickPinsToStations = () => {
        const pairs = [
            { pinType: 'origin', marker: journeyPickOriginPin },
            { pinType: 'destination', marker: journeyPickDestinationPin }
        ];
        for (const { pinType, marker } of pairs) {
            const sid = journeyPickStationIdsByType[pinType];
            if (!marker || !sid) continue;
            const coord = resolvePinCoordinate({ stationId: sid });
            if (!coord) continue;
            try {
                marker.setLngLat?.(coord);
            } catch {
                // ignore
            }
        }
    };

    const clearReachableStopsOverlay = () => {
        reachableStopsOverlayVisibleKey = EMPTY_KEY;
        lastReachableStopsPayload = null;
        reachableStopsLabelIds = null;
        reachableStopsExtremeLabelIds = null;
        applyReachableStopsLabelPriorityBoost(null);
        overlayRenderer?.clear?.();
        scheduleCollisionLayerRefresh?.();
    };

    const refreshReachableStopsOverlay = async (payload = null, options = {}) => {
        if (payload) {
            lastReachableStopsPayload = payload;
        } else {
            payload = lastReachableStopsPayload;
        }
        if (!payload) return;

        const data = buildReachableStopsOverlayGeoJSON({ payload, getStationCoord });
        overlayRenderer?.ensureLayers?.(data.dynamicColorExpression, payload.opacity);

        const nextKey = buildVisibleKey(data.geojson);
        if (nextKey === reachableStopsOverlayVisibleKey) return;
        reachableStopsOverlayVisibleKey = nextKey;

        overlayRenderer?.setData?.(data.geojson);

        reachableStopsLabelIds = getReachableStopsLabelIdSet(data.geojson);
        reachableStopsExtremeLabelIds = getReachableStopsExtremeLabelIdSet(data.geojson);
        applyReachableStopsLabelPriorityBoost(reachableStopsExtremeLabelIds);
        scheduleCollisionLayerRefresh?.();

        if (options?.fitBounds !== false && payload?.fitBounds !== false) {
            overlayRenderer?.fitToBounds?.(data.geojson, options);
        }
    };

    return {
        clearJourneyPickPin,
        clearReachableStopsOverlay,
        getReachableStopsExtremeLabelIds: () => reachableStopsExtremeLabelIds,
        getReachableStopsLabelIds: () => reachableStopsLabelIds,
        refreshReachableStopsOverlay,
        showJourneyPickPin,
        syncJourneyPickPinsToStations,
        updateReachableStopsOverlay: (payload = {}, options = {}) => (
            refreshReachableStopsOverlay(payload || {}, { fitBounds: true, ...options })
        )
    };
};

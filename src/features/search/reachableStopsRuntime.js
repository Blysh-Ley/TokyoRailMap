import {
    createReachableStopsColorExpression,
    normalizeReachableStopsPaletteTheme
} from './reachableStopsPalette.js';
import {
    getReachableStopsLastMileRadiusMeters
} from '../../domain/reachableStops/rules.js';

const EMPTY_KEY = '__empty__';
const INIT_KEY = '__init__';

const toText = (value) => String(value ?? '').trim();

export const reachableStopsCircleRadiusMeters = (remainingMs) => {
    const remainingMinutes = Number(remainingMs) / 60000;
    if (Number.isNaN(remainingMinutes)) return Number.NaN;
    return getReachableStopsLastMileRadiusMeters(
        remainingMinutes === Number.POSITIVE_INFINITY
            ? Number.MAX_VALUE
            : remainingMinutes
    );
};

export const buildReachableStopsOverlayGeoJSON = ({
    payload = {},
    getStationCoord = () => null,
    theme = 'light'
} = {}) => {
    const reachableStops = payload?.reachableStops;
    const remainingMsByStop = payload?.remainingMsByStop instanceof Map
        ? payload.remainingMsByStop
        : new Map();

    const stopIds = Array.isArray(reachableStops)
        ? reachableStops
        : (reachableStops instanceof Set ? Array.from(reachableStops) : Object.keys(payload?.remainingMsByStop || {}));

    const featureByCircleKey = new Map();

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
            const rawOpportunityCount = shift?.departureOpportunityCount ?? shift?.count ?? shift?.shiftCount;
            const departureOpportunityCount = Number(rawOpportunityCount) || 0;
            if (!Number.isFinite(remainingMs) || remainingMs < 0) continue;
            if (departureOpportunityCount <= 0) continue;

            const radiusMeters = Math.trunc(reachableStopsCircleRadiusMeters(remainingMs));
            const normalizedLng = lng.toFixed(6);
            const normalizedLat = lat.toFixed(6);
            const circleKey = `${normalizedLng}|${normalizedLat}|${radiusMeters}`;
            const existing = featureByCircleKey.get(circleKey);

            if (existing) {
                if (!existing.stationIdSet.has(stopId)) {
                    existing.stationIdSet.add(stopId);
                    existing.feature.properties.stationIds.push(stopId);
                }
                existing.feature.properties.remainingMs = Math.max(
                    existing.feature.properties.remainingMs,
                    remainingMs
                );
                existing.feature.properties.departureOpportunityCount = Math.max(
                    existing.feature.properties.departureOpportunityCount,
                    departureOpportunityCount
                );
                existing.feature.properties.shiftCount = existing.feature.properties.departureOpportunityCount;
                continue;
            }

            const feature = {
                type: 'Feature',
                properties: {
                    id: stopId,
                    stationIds: [stopId],
                    remainingMs,
                    radiusMeters,
                    departureOpportunityCount,
                    shiftCount: departureOpportunityCount,
                    sortKey: 0
                },
                geometry: {
                    type: 'Point',
                    coordinates: [Number(normalizedLng), Number(normalizedLat)]
                }
            };
            featureByCircleKey.set(circleKey, {
                feature,
                stationIdSet: new Set([stopId])
            });
        }
    }

    const features = Array.from(featureByCircleKey.values(), ({ feature }) => {
        feature.properties.stationIds.sort();
        feature.properties.id = feature.properties.stationIds[0] || feature.properties.id;
        feature.properties.sortKey = (
            (feature.properties.departureOpportunityCount * 100000)
            - feature.properties.radiusMeters
        );
        return feature;
    });

    features.sort((a, b) => {
        if (a.properties.departureOpportunityCount !== b.properties.departureOpportunityCount) {
            return a.properties.departureOpportunityCount - b.properties.departureOpportunityCount;
        }
        if (a.properties.radiusMeters !== b.properties.radiusMeters) {
            return b.properties.radiusMeters - a.properties.radiusMeters;
        }
        const aCoordinates = a.geometry.coordinates;
        const bCoordinates = b.geometry.coordinates;
        if (aCoordinates[0] !== bCoordinates[0]) return aCoordinates[0] - bCoordinates[0];
        if (aCoordinates[1] !== bCoordinates[1]) return aCoordinates[1] - bCoordinates[1];
        return toText(a.properties.id).localeCompare(toText(b.properties.id));
    });

    return {
        geojson: { type: 'FeatureCollection', features },
        dynamicColorExpression: createReachableStopsColorExpression(theme),
        theme: normalizeReachableStopsPaletteTheme(theme)
    };
};

const getFeatureStationIds = (feature) => {
    const stationIds = Array.isArray(feature?.properties?.stationIds)
        ? feature.properties.stationIds
        : [feature?.properties?.id ?? feature?.id];
    return stationIds.map(toText).filter(Boolean);
};

export const getReachableStopsLabelIdSet = (geojson) => {
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    if (!features.length) return null;
    const out = new Set();
    for (const feature of features) {
        for (const sid of getFeatureStationIds(feature)) out.add(sid);
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
        Number(feature?.properties?.departureOpportunityCount ?? feature?.properties?.shiftCount) || 0,
        Math.trunc(Number(feature?.properties?.radiusMeters) || 0),
        (feature?.geometry?.coordinates?.[0] || 0).toFixed(6),
        (feature?.geometry?.coordinates?.[1] || 0).toFixed(6),
        getFeatureStationIds(feature).sort()
    ])
);

export const createTravelSearchMapRuntime = ({
    mapEngine,
    overlayRenderer,
    getStationCoord = () => null,
    getStationLabels = () => [],
    getIsDarkTheme = () => false,
    createJourneyPickPinElement,
    onJourneyPickPinStationIdsChange = () => {},
    scheduleCollisionLayerRefresh = () => {}
} = {}) => {
    let reachableStopsOverlayVisibleKey = INIT_KEY;
    let reachableStopsOverlaySourceDirty = false;
    let reachableStopsLabelIds = null;
    let reachableStopsExtremeLabelIds = null;
    let lastReachableStopsPayload = null;
    let journeyPickOriginPin = null;
    let journeyPickDestinationPin = null;
    const journeyPickWaypointPins = new Map();
    const journeyPickWaypointStationIdsByType = new Map();
    const journeyPickStationIdsByType = {
        origin: '',
        destination: ''
    };

    const notifyJourneyPickPinStationIdsChange = () => {
        try {
            onJourneyPickPinStationIdsChange({
                origin: journeyPickStationIdsByType.origin || '',
                destination: journeyPickStationIdsByType.destination || '',
                waypoints: Object.fromEntries(journeyPickWaypointStationIdsByType)
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
        if (!pinType) {
            for (const marker of journeyPickWaypointPins.values()) {
                try { marker?.remove?.(); } catch { /* ignore */ }
            }
            journeyPickWaypointPins.clear();
            journeyPickWaypointStationIdsByType.clear();
        } else if (pinType.startsWith('waypoint-')) {
            try { journeyPickWaypointPins.get(pinType)?.remove?.(); } catch { /* ignore */ }
            journeyPickWaypointPins.delete(pinType);
            journeyPickWaypointStationIdsByType.delete(pinType);
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

    const showJourneyPickPin = async ({ label = '', lngLat, stationId, type = 'origin' } = {}) => {
        const pinType = toText(type).toLowerCase();
        const waypointPin = pinType.startsWith('waypoint-');
        if (pinType !== 'origin' && pinType !== 'destination' && !waypointPin) return;
        const sid = toText(stationId);
        const coord = resolvePinCoordinate({ lngLat, stationId });

        clearJourneyPickPin(pinType);
        if (!coord) return;
        if (!mapEngine || typeof createJourneyPickPinElement !== 'function') return;

        try {
            const element = await createJourneyPickPinElement({ label, type: pinType });
            const marker = mapEngine.createMarker({ element, anchor: 'bottom', offset: [0, 0] })
                .setLngLat(coord);
            mapEngine.addMarker(marker);
            if (pinType === 'origin') journeyPickOriginPin = marker;
            else if (pinType === 'destination') journeyPickDestinationPin = marker;
            else journeyPickWaypointPins.set(pinType, marker);
            if (pinType === 'origin' || pinType === 'destination') {
                journeyPickStationIdsByType[pinType] = sid;
            } else if (sid) {
                journeyPickWaypointStationIdsByType.set(pinType, sid);
            }
            notifyJourneyPickPinStationIdsChange();
        } catch {
            // ignore
        }
    };

    const syncJourneyPickPinsToStations = () => {
        const pairs = [
            { pinType: 'origin', marker: journeyPickOriginPin },
            { pinType: 'destination', marker: journeyPickDestinationPin },
            ...Array.from(journeyPickWaypointPins, ([pinType, marker]) => ({ pinType, marker }))
        ];
        for (const { pinType, marker } of pairs) {
            const sid = pinType.startsWith('waypoint-')
                ? journeyPickWaypointStationIdsByType.get(pinType)
                : journeyPickStationIdsByType[pinType];
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
        let sourceCleared = true;
        try {
            sourceCleared = overlayRenderer?.clear?.() !== false;
        } catch {
            sourceCleared = false;
        }
        reachableStopsOverlaySourceDirty = !sourceCleared;
        reachableStopsOverlayVisibleKey = EMPTY_KEY;
        lastReachableStopsPayload = null;
        reachableStopsLabelIds = null;
        reachableStopsExtremeLabelIds = null;
        applyReachableStopsLabelPriorityBoost(null);
        scheduleCollisionLayerRefresh?.();
        return sourceCleared;
    };

    const refreshReachableStopsOverlay = async (payload = null, options = {}) => {
        if (payload) {
            lastReachableStopsPayload = payload;
        } else {
            payload = lastReachableStopsPayload;
        }
        if (!payload) return true;

        let theme = options?.theme ?? payload?.theme;
        if (theme !== 'dark' && theme !== 'light') {
            try {
                theme = getIsDarkTheme?.() === true ? 'dark' : 'light';
            } catch {
                theme = 'light';
            }
        }
        const data = buildReachableStopsOverlayGeoJSON({ payload, getStationCoord, theme });
        overlayRenderer?.ensureLayers?.(
            data.dynamicColorExpression,
            payload.opacity,
            { theme: data.theme }
        );

        const nextKey = buildVisibleKey(data.geojson);
        if (
            nextKey === reachableStopsOverlayVisibleKey &&
            !reachableStopsOverlaySourceDirty
        ) return true;

        let sourceUpdated = true;
        try {
            sourceUpdated = overlayRenderer?.setData?.(data.geojson) !== false;
        } catch {
            sourceUpdated = false;
        }
        if (!sourceUpdated) {
            reachableStopsOverlaySourceDirty = true;
            return false;
        }
        reachableStopsOverlaySourceDirty = false;
        reachableStopsOverlayVisibleKey = nextKey;

        reachableStopsLabelIds = getReachableStopsLabelIdSet(data.geojson);
        reachableStopsExtremeLabelIds = getReachableStopsExtremeLabelIdSet(data.geojson);
        applyReachableStopsLabelPriorityBoost(reachableStopsExtremeLabelIds);
        scheduleCollisionLayerRefresh?.();

        if (options?.fitBounds !== false && payload?.fitBounds !== false) {
            overlayRenderer?.fitToBounds?.(data.geojson, options);
        }
        return true;
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

const toText = (value) => String(value ?? '').trim();

const addUnique = (out, seen, value) => {
    const id = toText(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
};

const collectStationIdsFromSegments = (segments, out, seen) => {
    if (!Array.isArray(segments)) return;
    for (const segment of segments) {
        const stationIds = Array.isArray(segment?.stationIds) ? segment.stationIds : [];
        for (const stationId of stationIds) addUnique(out, seen, stationId);
    }
};

const collectStationIdsFromVirtualTimetable = (rows, out, seen) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
        addUnique(out, seen, row?.stationId || row?.stopId || row?.id);
    }
};

export const collectMobileTripFitStationIds = (payload = {}) => {
    const out = [];
    const seen = new Set();

    collectStationIdsFromSegments(payload?.segments, out, seen);
    collectStationIdsFromVirtualTimetable(payload?.virtualTimetable, out, seen);

    const virtualTrips = Array.isArray(payload?.virtualTrips) ? payload.virtualTrips : [];
    for (const trip of virtualTrips) {
        collectStationIdsFromSegments(trip?.segments, out, seen);
        collectStationIdsFromVirtualTimetable(trip?.virtualTimetable, out, seen);
    }

    addUnique(out, seen, payload?.originStationId);
    addUnique(out, seen, payload?.mainTerminalStationId);
    addUnique(out, seen, payload?.terminalStationId);
    addUnique(out, seen, payload?.destinationStationId);

    return out;
};

const extendBBox = (bbox, lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return bbox;
    if (!bbox) return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
    if (lng < bbox.minLng) bbox.minLng = lng;
    if (lat < bbox.minLat) bbox.minLat = lat;
    if (lng > bbox.maxLng) bbox.maxLng = lng;
    if (lat > bbox.maxLat) bbox.maxLat = lat;
    return bbox;
};

const bboxToBounds = (bbox) => {
    if (!bbox) return null;
    const flat = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat];
    if (!flat.every(Number.isFinite)) return null;
    if (bbox.minLng === bbox.maxLng && bbox.minLat === bbox.maxLat) return null;
    return [
        [bbox.minLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat]
    ];
};

export const createMobileTripFitBoundsController = ({
    mapEngine,
    getStationCoord = () => null
} = {}) => {
    const fitTripPayload = (payload = {}) => {
        const stationIds = collectMobileTripFitStationIds(payload);
        if (stationIds.length < 2) return false;

        let bbox = null;
        for (const stationId of stationIds) {
            const coord = getStationCoord(stationId);
            if (!Array.isArray(coord) || coord.length < 2) continue;
            bbox = extendBBox(bbox, Number(coord[0]), Number(coord[1]));
        }

        const bounds = bboxToBounds(bbox);
        if (!bounds) return false;

        mapEngine?.fitBounds?.(bounds, {
            padding: 0,
            duration: 300,
            easing: (t) => t,
            essential: true
        });
        return true;
    };

    return { fitTripPayload };
};

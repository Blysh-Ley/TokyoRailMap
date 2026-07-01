const toText = (value) => String(value ?? '').trim();

const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

export const buildLngLatBoundsObject = ({ west, east, south, north } = {}) => {
    const resolved = {
        west: toFiniteNumber(west),
        east: toFiniteNumber(east),
        south: toFiniteNumber(south),
        north: toFiniteNumber(north)
    };
    return Object.values(resolved).every((value) => value != null) ? resolved : null;
};

export const getStationIdsInLngLatBounds = (stationsGeoJSON, bounds) => {
    if (!bounds || typeof bounds !== 'object') return null;
    const resolvedBounds = buildLngLatBoundsObject(bounds);
    if (!resolvedBounds) return null;

    const features = Array.isArray(stationsGeoJSON?.features) ? stationsGeoJSON.features : [];
    const out = new Set();
    for (const feature of features) {
        if (feature?.geometry?.type !== 'Point') continue;
        const c = feature?.geometry?.coordinates;
        if (!Array.isArray(c) || c.length < 2) continue;
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        if (lat < resolvedBounds.south || lat > resolvedBounds.north) continue;
        const inLngRange = resolvedBounds.west <= resolvedBounds.east
            ? lng >= resolvedBounds.west && lng <= resolvedBounds.east
            : (lng >= resolvedBounds.west || lng <= resolvedBounds.east);
        if (!inLngRange) continue;
        const sid = toText(feature?.properties?.id ?? feature?.id);
        if (sid) out.add(sid);
    }
    return out;
};

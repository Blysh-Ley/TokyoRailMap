export const buildStationCoordMapFromGeoJSON = (geojson) => {
    const coordById = new Map();
    const features = Array.isArray(geojson?.features) ? geojson.features : [];

    for (const feature of features) {
        const sid = String(feature?.properties?.id ?? feature?.id ?? '').trim();
        const coordinates = feature?.geometry?.coordinates;
        if (!sid || !Array.isArray(coordinates) || coordinates.length < 2) continue;

        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        coordById.set(sid, [lng, lat]);
    }

    return coordById;
};

export const createStationCoordinateAdapter = ({ stationLabels = [], stationCircles = [] } = {}) => {
    const updateLabels = (geojson) => {
        const coordById = buildStationCoordMapFromGeoJSON(geojson);
        for (const item of stationLabels) {
            const sid = String(item?.stationId ?? item?.props?.id ?? '').trim();
            const coordinates = sid ? coordById.get(sid) : null;
            if (!coordinates) continue;
            item.coordinates = coordinates;
            try {
                item.marker?.setLngLat?.(coordinates);
            } catch {
                // ignore
            }
        }
    };

    const updateCircles = (geojson) => {
        const coordById = buildStationCoordMapFromGeoJSON(geojson);
        for (const item of stationCircles) {
            const sid = String(item?.stationId ?? '').trim();
            const coordinates = sid ? coordById.get(sid) : null;
            if (!coordinates) continue;
            item.coordinates = coordinates;
        }
    };

    return {
        updateCircles,
        updateLabels
    };
};

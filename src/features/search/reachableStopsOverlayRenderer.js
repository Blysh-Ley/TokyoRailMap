const SOURCE_ID = 'reachable-stops-overlay-source';
const CIRCLE_LAYER_ID = 'reachable-stops-overlay-circle-layer';
const EMPTY_FEATURE_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: [] });

export const createReachableStopsOverlayRenderer = ({ mapEngine } = {}) => {
    if (!mapEngine) {
        throw new Error('reachableStopsOverlayRenderer requires mapEngine');
    }

    const getBeforeLayerId = () => (
        mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );

    const ensureLayers = (dynamicColorExpression, baseOpacity = 0.12) => {
        const beforeLayerId = getBeforeLayerId();

        mapEngine.ensureGeoJsonSource?.(SOURCE_ID, EMPTY_FEATURE_COLLECTION);

        if (!mapEngine.getLayer(CIRCLE_LAYER_ID)) {
            mapEngine.ensureLayer?.({
                id: CIRCLE_LAYER_ID,
                type: 'circle',
                source: SOURCE_ID,
                layout: {
                    'circle-sort-key': ['get', 'sortKey']
                },
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['exponential', 2],
                        ['zoom'],
                        0, ['/', ['get', 'radiusMeters'], 127113 * 2],
                        20, ['*', ['get', 'radiusMeters'], 1048576 * 2 / 127113]
                    ],
                    'circle-color': dynamicColorExpression,
                    'circle-opacity': baseOpacity,
                    'circle-blur': 1,
                    'circle-pitch-alignment': 'map'
                }
            }, beforeLayerId);
            return;
        }

        try {
            mapEngine.applyPaintProperties?.(CIRCLE_LAYER_ID, {
                'circle-color': dynamicColorExpression,
                'circle-opacity': baseOpacity
            });
            if (beforeLayerId) mapEngine.moveLayer(CIRCLE_LAYER_ID, beforeLayerId);
        } catch {
            // ignore
        }
    };

    const setData = (geojson) => {
        try {
            mapEngine.updateGeoJsonSource?.(SOURCE_ID, geojson || EMPTY_FEATURE_COLLECTION);
        } catch {
            // ignore
        }
    };

    const clear = () => {
        setData(EMPTY_FEATURE_COLLECTION);
    };

    const fitToBounds = (geojson) => {
        const features = Array.isArray(geojson?.features) ? geojson.features : [];
        if (!features.length) return;

        let minLng = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLng = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;

        for (const feature of features) {
            const coordinates = feature?.geometry?.coordinates;
            if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
            const lng = Number(coordinates[0]);
            const lat = Number(coordinates[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }

        if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return;

        if (minLng === maxLng && minLat === maxLat) {
            const dLng = 0.006;
            const dLat = 0.004;
            minLng -= dLng;
            maxLng += dLng;
            minLat -= dLat;
            maxLat += dLat;
        }

        try {
            mapEngine.fitBounds([[minLng, minLat], [maxLng, maxLat]]);
        } catch {
            // ignore
        }
    };

    return {
        clear,
        ensureLayers,
        fitToBounds,
        setData
    };
};

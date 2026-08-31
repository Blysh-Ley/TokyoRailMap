import {
    createReachableStopsColorExpression,
    getReachableStopsStrokeColor,
    normalizeReachableStopsPaletteTheme
} from './reachableStopsPalette.js';

const SOURCE_ID = 'reachable-stops-overlay-source';
const CIRCLE_LAYER_ID = 'reachable-stops-overlay-circle-layer';
const EMPTY_FEATURE_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: [] });

export const createReachableStopsOverlayRenderer = ({
    mapEngine,
    getIsDarkTheme = () => false
} = {}) => {
    if (!mapEngine) {
        throw new Error('reachableStopsOverlayRenderer requires mapEngine');
    }

    let lastDesiredGeojson = EMPTY_FEATURE_COLLECTION;
    let lastCommittedGeojson = EMPTY_FEATURE_COLLECTION;
    let lastDynamicColorExpression = null;
    let lastBaseOpacity = 0.6;
    let lastTheme = 'light';

    const getBeforeLayerId = () => (
        mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );

    const resolveTheme = (options = {}) => {
        const requestedTheme = typeof options === 'string' ? options : options?.theme;
        if (requestedTheme === 'dark' || requestedTheme === 'light') {
            return requestedTheme;
        }
        try {
            return getIsDarkTheme?.() === true ? 'dark' : 'light';
        } catch {
            return 'light';
        }
    };

    const buildCirclePaint = (dynamicColorExpression, baseOpacity, theme) => ({
        'circle-color': dynamicColorExpression || createReachableStopsColorExpression(theme),
        'circle-opacity': Number.isFinite(Number(baseOpacity)) ? Number(baseOpacity) : 0.6,
        'circle-blur': 0.25,
        'circle-stroke-width': 0,
        'circle-stroke-color': getReachableStopsStrokeColor(theme),
        'circle-stroke-opacity': 0.7
    });

    const ensureLayers = (dynamicColorExpression, baseOpacity = 0.6, options = {}) => {
        const beforeLayerId = getBeforeLayerId();
        const theme = normalizeReachableStopsPaletteTheme(resolveTheme(options));
        const colorExpression = dynamicColorExpression || createReachableStopsColorExpression(theme);
        const opacity = Number.isFinite(Number(baseOpacity)) ? Number(baseOpacity) : 0.6;
        lastDynamicColorExpression = colorExpression;
        lastBaseOpacity = opacity;
        lastTheme = theme;
        const circlePaint = buildCirclePaint(colorExpression, opacity, theme);

        // MapLibre drops custom sources during a style reload. Reusing the desired
        // payload preserves a pending clear/update even when the last write failed.
        mapEngine.ensureGeoJsonSource?.(SOURCE_ID, lastDesiredGeojson);
        if (
            lastDesiredGeojson !== lastCommittedGeojson &&
            typeof mapEngine.updateGeoJsonSource === 'function'
        ) {
            try {
                const source = mapEngine.updateGeoJsonSource(SOURCE_ID, lastDesiredGeojson);
                if (source) lastCommittedGeojson = lastDesiredGeojson;
            } catch {
                // A later ensure/style reload retries the desired payload.
            }
        }

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
                    ...circlePaint,
                    'circle-pitch-alignment': 'map'
                }
            }, beforeLayerId);
            return;
        }

        try {
            mapEngine.applyPaintProperties?.(CIRCLE_LAYER_ID, circlePaint);
            if (beforeLayerId) mapEngine.moveLayer(CIRCLE_LAYER_ID, beforeLayerId);
        } catch {
            // ignore
        }
    };

    const setData = (geojson) => {
        const nextGeojson = geojson || EMPTY_FEATURE_COLLECTION;
        lastDesiredGeojson = nextGeojson;
        if (typeof mapEngine.updateGeoJsonSource !== 'function') return false;
        try {
            const source = mapEngine.updateGeoJsonSource(SOURCE_ID, nextGeojson);
            if (!source) return false;
            lastCommittedGeojson = nextGeojson;
            return true;
        } catch {
            return false;
        }
    };

    const clear = () => setData(EMPTY_FEATURE_COLLECTION);

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

    mapEngine.on?.('style.load', () => {
        ensureLayers(lastDynamicColorExpression, lastBaseOpacity, { theme: lastTheme });
    });

    return {
        clear,
        ensureLayers,
        fitToBounds,
        refreshTheme: (theme, dynamicColorExpression, baseOpacity = 0.6) => (
            ensureLayers(dynamicColorExpression, baseOpacity, { theme })
        ),
        setData
    };
};

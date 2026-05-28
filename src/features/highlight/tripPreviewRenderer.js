const LINE_SOURCE_ID = 'trip-preview-source';
const STOPS_SOURCE_ID = 'trip-preview-stops-source';
const LINE_LAYER_ID = 'trip-preview-line-layer';
const CONNECTOR_LAYER_ID = 'trip-preview-connector-layer';
const STOPS_LAYER_ID = 'trip-preview-stops-layer';
const EMPTY_FEATURE_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: [] });

export const createTripPreviewRenderer = ({
    mapEngine,
    getLinePaint,
    getStopPaint
} = {}) => {
    if (!mapEngine) {
        throw new Error('tripPreviewRenderer requires mapEngine');
    }
    if (typeof getLinePaint !== 'function') {
        throw new Error('tripPreviewRenderer requires getLinePaint');
    }
    if (typeof getStopPaint !== 'function') {
        throw new Error('tripPreviewRenderer requires getStopPaint');
    }

    const getBeforeLayerId = () => (
        mapEngine.getLayer('transfer-capsule-outline-layer')
            ? 'transfer-capsule-outline-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );

    const applyStopPaint = (paintOverride = null) => {
        if (!mapEngine.getLayer(STOPS_LAYER_ID)) return;
        const stopPaint = paintOverride || getStopPaint();
        try {
            Object.entries(stopPaint || {}).forEach(([property, value]) => {
                mapEngine.setPaintProperty(STOPS_LAYER_ID, property, value);
            });
        } catch {
            // ignore
        }
    };

    const ensureLayers = () => {
        const beforeLayerId = getBeforeLayerId();

        if (!mapEngine.getSource(LINE_SOURCE_ID)) {
            mapEngine.addSource(LINE_SOURCE_ID, {
                type: 'geojson',
                data: EMPTY_FEATURE_COLLECTION
            });
        }

        if (!mapEngine.getLayer(LINE_LAYER_ID)) {
            mapEngine.addLayer({
                id: LINE_LAYER_ID,
                type: 'line',
                source: LINE_SOURCE_ID,
                filter: ['!=', ['get', 'role'], 'connector'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: getLinePaint()
            }, beforeLayerId);
        } else if (beforeLayerId) {
            try {
                mapEngine.moveLayer(LINE_LAYER_ID, beforeLayerId);
            } catch {
                // ignore
            }
        }

        if (!mapEngine.getLayer(CONNECTOR_LAYER_ID)) {
            mapEngine.addLayer({
                id: CONNECTOR_LAYER_ID,
                type: 'line',
                source: LINE_SOURCE_ID,
                filter: ['==', ['get', 'role'], 'connector'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: getLinePaint()
            }, beforeLayerId);
        } else if (beforeLayerId) {
            try {
                mapEngine.moveLayer(CONNECTOR_LAYER_ID, beforeLayerId);
            } catch {
                // ignore
            }
        }

        if (!mapEngine.getSource(STOPS_SOURCE_ID)) {
            mapEngine.addSource(STOPS_SOURCE_ID, {
                type: 'geojson',
                data: EMPTY_FEATURE_COLLECTION
            });
        }

        if (!mapEngine.getLayer(STOPS_LAYER_ID)) {
            mapEngine.addLayer({
                id: STOPS_LAYER_ID,
                type: 'circle',
                source: STOPS_SOURCE_ID,
                paint: getStopPaint()
            });
            return;
        }

        applyStopPaint();
    };

    const reset = () => {
        try {
            mapEngine.getSource(LINE_SOURCE_ID)?.setData?.(EMPTY_FEATURE_COLLECTION);
            mapEngine.getSource(STOPS_SOURCE_ID)?.setData?.(EMPTY_FEATURE_COLLECTION);
        } catch {
            // ignore
        }
    };

    const setData = ({ lineFc, stopFc } = {}) => {
        try {
            mapEngine.getSource(LINE_SOURCE_ID)?.setData?.(lineFc || EMPTY_FEATURE_COLLECTION);
            mapEngine.getSource(STOPS_SOURCE_ID)?.setData?.(stopFc || EMPTY_FEATURE_COLLECTION);
        } catch {
            // ignore
        }
    };

    return {
        applyStopPaint,
        ensureLayers,
        reset,
        setData
    };
};

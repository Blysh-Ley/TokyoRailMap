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
            mapEngine.applyPaintProperties?.(STOPS_LAYER_ID, stopPaint);
        } catch {
            // ignore
        }
    };

    const applyLinePaint = (paintOverride = null) => {
        const linePaint = paintOverride || getLinePaint();
        for (const layerId of [LINE_LAYER_ID, CONNECTOR_LAYER_ID]) {
            if (!mapEngine.getLayer(layerId)) continue;
            try {
                mapEngine.applyPaintProperties?.(layerId, linePaint);
            } catch {
                // ignore
            }
        }
    };

    const ensureLayers = () => {
        const beforeLayerId = getBeforeLayerId();

        mapEngine.ensureGeoJsonSource?.(LINE_SOURCE_ID, EMPTY_FEATURE_COLLECTION);

        if (!mapEngine.getLayer(LINE_LAYER_ID)) {
            mapEngine.ensureLayer?.({
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
            applyLinePaint();
        } else {
            applyLinePaint();
        }

        if (!mapEngine.getLayer(CONNECTOR_LAYER_ID)) {
            mapEngine.ensureLayer?.({
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
            applyLinePaint();
        } else {
            applyLinePaint();
        }

        mapEngine.ensureGeoJsonSource?.(STOPS_SOURCE_ID, EMPTY_FEATURE_COLLECTION);

        if (!mapEngine.getLayer(STOPS_LAYER_ID)) {
            mapEngine.ensureLayer?.({
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
            mapEngine.updateGeoJsonSource?.(LINE_SOURCE_ID, EMPTY_FEATURE_COLLECTION);
            mapEngine.updateGeoJsonSource?.(STOPS_SOURCE_ID, EMPTY_FEATURE_COLLECTION);
        } catch {
            // ignore
        }
    };

    const setData = ({ lineFc, stopFc } = {}) => {
        try {
            mapEngine.updateGeoJsonSource?.(LINE_SOURCE_ID, lineFc || EMPTY_FEATURE_COLLECTION);
            mapEngine.updateGeoJsonSource?.(STOPS_SOURCE_ID, stopFc || EMPTY_FEATURE_COLLECTION);
        } catch {
            // ignore
        }
    };

    return {
        applyLinePaint,
        applyStopPaint,
        ensureLayers,
        reset,
        setData
    };
};

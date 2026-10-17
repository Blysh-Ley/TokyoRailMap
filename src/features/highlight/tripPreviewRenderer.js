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

        const linePaint = getLinePaint();
        for (const [layerId, operator] of [[LINE_LAYER_ID, '!='], [CONNECTOR_LAYER_ID, '==']]) {
            if (!mapEngine.getLayer(layerId)) {
                mapEngine.ensureLayer?.({
                    id: layerId,
                    type: 'line',
                    source: LINE_SOURCE_ID,
                    filter: [operator, ['get', 'role'], 'connector'],
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: linePaint
                }, beforeLayerId);
            } else {
                try {
                    mapEngine.applyPaintProperties?.(layerId, linePaint);
                } catch {
                    // 保留已有图层样式。
                }
            }
        }

        if (beforeLayerId) {
            const order = mapEngine.getLayersOrder();
            const beforeIndex = order.indexOf(beforeLayerId);
            // 顺序未变时不调用 moveLayer，避免重复提交层级和触发布局更新。
            if (order[beforeIndex - 2] !== LINE_LAYER_ID || order[beforeIndex - 1] !== CONNECTOR_LAYER_ID) {
                try {
                    mapEngine.moveLayer(LINE_LAYER_ID, beforeLayerId);
                    mapEngine.moveLayer(CONNECTOR_LAYER_ID, beforeLayerId);
                } catch {
                    // 保留已有图层顺序。
                }
            }
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

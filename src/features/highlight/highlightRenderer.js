const DEFAULT_LAYERS = Object.freeze({
    lines: 'lines-layer',
    stations: 'stations-layer'
});

export const createHighlightRenderer = ({ mapEngine, layers = DEFAULT_LAYERS } = {}) => {
    if (!mapEngine) {
        throw new Error('highlightRenderer requires mapEngine');
    }

    const layerIds = { ...DEFAULT_LAYERS, ...(layers || {}) };
    const hasLayer = (layerId) => Boolean(layerId && mapEngine.getLayer(layerId));

    const setPaintProperties = (layerId, paint = {}) => {
        if (!hasLayer(layerId)) return false;
        try {
            return mapEngine.applyPaintProperties?.(layerId, paint) === true;
        } catch {
            return false;
        }
    };

    const applyLinePaint = (paint = {}) => setPaintProperties(layerIds.lines, {
        'line-color': paint['line-color'],
        'line-width': paint['line-width'],
        'line-opacity': paint['line-opacity']
    });

    const applyLineFilter = (filterExpr) => {
        if (!hasLayer(layerIds.lines)) return false;
        try {
            return mapEngine.setLayerFilter?.(layerIds.lines, filterExpr) === true;
        } catch {
            return false;
        }
    };

    const applyStationSelectionPaint = (paint = {}) => setPaintProperties(layerIds.stations, {
        'circle-radius': paint['circle-radius'],
        'circle-stroke-width': paint['circle-stroke-width'],
        'circle-opacity': paint['circle-opacity'],
        'circle-stroke-opacity': paint['circle-stroke-opacity']
    });

    const applyStationThemePaint = ({ stationsPaint = {} } = {}) => {
        setPaintProperties(layerIds.stations, stationsPaint);
    };

    return {
        hasLayer,
        applyLinePaint,
        applyLineFilter,
        applyStationSelectionPaint,
        applyStationThemePaint
    };
};

const DEFAULT_LAYERS = Object.freeze({
    lines: 'lines-layer',
    stations: 'stations-layer',
    tripPreviewStops: 'trip-preview-stops-layer'
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
            Object.entries(paint || {}).forEach(([property, value]) => {
                mapEngine.setPaintProperty(layerId, property, value);
            });
            return true;
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
            mapEngine.setFilter(layerIds.lines, filterExpr);
            return true;
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

    const applyStationThemePaint = ({ stationsPaint = {}, tripPreviewStopsPaint = {} } = {}) => {
        setPaintProperties(layerIds.stations, stationsPaint);
        setPaintProperties(layerIds.tripPreviewStops, tripPreviewStopsPaint);
    };

    return {
        hasLayer,
        applyLinePaint,
        applyLineFilter,
        applyStationSelectionPaint,
        applyStationThemePaint
    };
};

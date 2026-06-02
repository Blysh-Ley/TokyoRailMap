export const registerTokyoRailMapRuntime = ({
    map,
    mapEngine,
    buildOffsetPolylinePixelsWithMiter,
    getLineOffsetPixelsPerUnitAtZoom,
    getStationOffsetGeoJSONAtZoom,
    target = window
} = {}) => {
    if (!target) return false;

    try {
        const previous = target.TokyoRailMapRuntime || {};
        target.__TokyoRailMap = map;
        target.TokyoRailMapRuntime = {
            ...previous,
            getBaseMap: () => map || previous.getBaseMap?.() || null,
            getMapEngine: () => mapEngine || previous.getMapEngine?.() || null,
            ...(typeof buildOffsetPolylinePixelsWithMiter === 'function'
                ? { buildOffsetPolylinePixelsWithMiter }
                : {}),
            ...(typeof getLineOffsetPixelsPerUnitAtZoom === 'function'
                ? { getLineOffsetPixelsPerUnitAtZoom }
                : {}),
            ...(typeof getStationOffsetGeoJSONAtZoom === 'function'
                ? { getStationOffsetGeoJSONAtZoom }
                : {})
        };
        return true;
    } catch {
        return false;
    }
};

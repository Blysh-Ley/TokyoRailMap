export const registerTokyoRailMapRuntime = ({
    map,
    mapEngine,
    basemapThemeRuntime,
    getExportBasemapStyle,
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
            ...(typeof getExportBasemapStyle === 'function'
                ? { getExportBasemapStyle }
                : {}),
            ...(basemapThemeRuntime
                ? {
                    getExportBasemapStyle: (options = {}) => basemapThemeRuntime.getExportStyle?.(options) || null,
                    getBasemapMode: () => basemapThemeRuntime.getMode?.() || null,
                    getBasemapPackage: () => basemapThemeRuntime.getPackage?.() || null,
                    getPmtilesAvailable: () => basemapThemeRuntime.getPmtilesAvailable?.() === true,
                    getMapAttributionItems: () => basemapThemeRuntime.getMapAttributionItems?.() || []
                }
                : {}),
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

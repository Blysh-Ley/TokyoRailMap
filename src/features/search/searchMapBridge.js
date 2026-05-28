export const createSearchMapBridge = ({
    hoverApi = {},
    journeyPickApi = {},
    reachableStopsApi = {},
    routePreviewApi = {},
    selectionApi = {},
    stationApi = {},
    stateApi = {}
} = {}) => ({
    isReady: false,

    snapshotSelectionState: () => stateApi.snapshotSelectionState?.(),
    restoreSelectionState: (snapshot) => stateApi.restoreSelectionState?.(snapshot),

    beginHoverPreview: () => hoverApi.beginHoverPreview?.() === true,
    endHoverPreview: () => hoverApi.endHoverPreview?.(),
    commitHoverPreview: () => hoverApi.commitHoverPreview?.(),

    previewTripPath: (payload, options = {}) => routePreviewApi.previewTripPath?.(payload, options),
    clearTripPathPreview: () => routePreviewApi.clearTripPathPreview?.(),
    clearTripPathPreviewBySource: (source) => routePreviewApi.clearTripPathPreviewBySource?.(source),

    showJourneyPickPin: (payload = {}) => journeyPickApi.showJourneyPickPin?.(payload),
    clearJourneyPickPin: (type) => journeyPickApi.clearJourneyPickPin?.(type),

    updateReachableStopsOverlay: (payload = {}) => reachableStopsApi.updateReachableStopsOverlay?.(payload),
    clearReachableStopsOverlay: () => reachableStopsApi.clearReachableStopsOverlay?.(),

    clearStationSelection: () => selectionApi.clearStationSelection?.(),
    previewLine: (lineId) => selectionApi.previewLine?.(lineId),
    commitLine: (lineId) => selectionApi.commitLine?.(lineId),
    previewCompany: (companyName) => selectionApi.previewCompany?.(companyName),
    commitCompany: (companyName) => selectionApi.commitCompany?.(companyName),

    previewStation: (stationId, meta) => stationApi.previewStation?.(stationId, meta),
    commitStation: (stationId, meta) => stationApi.commitStation?.(stationId, meta),
    closeStationPopup: (options = {}) => stationApi.closeStationPopup?.(options)
});

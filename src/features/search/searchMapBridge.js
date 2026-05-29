import {
    mapClick,
    reachableStopsCleared,
    reachableStopsUpdateRequested,
    tripPreviewCleared,
    tripPreviewRequested
} from '../../store/actions.js';

export const createSearchMapBridge = ({
    hoverApi = {},
    journeyPickApi = {},
    reachableStopsApi = {},
    routePreviewApi = {},
    selectionApi = {},
    stationApi = {},
    stateApi = {},
    store = null
} = {}) => {
    const dispatch = (action) => {
        if (store && typeof store.dispatch === 'function') store.dispatch(action);
    };

    const recordMapClick = (event) => {
        dispatch(mapClick({
            source: 'searchMapBridge',
            point: event?.point ? { x: event.point.x, y: event.point.y } : null,
            lngLat: event?.lngLat ? { lng: event.lngLat.lng, lat: event.lngLat.lat } : null
        }));
    };

    return {
        isReady: false,

        snapshotSelectionState: () => stateApi.snapshotSelectionState?.(),
        restoreSelectionState: (snapshot) => stateApi.restoreSelectionState?.(snapshot),

        beginHoverPreview: () => hoverApi.beginHoverPreview?.() === true,
        endHoverPreview: () => hoverApi.endHoverPreview?.(),
        commitHoverPreview: () => hoverApi.commitHoverPreview?.(),

        previewTripPath: (payload, options = {}) => {
            dispatch(tripPreviewRequested({ source: 'searchMapBridge', payload, options }));
            return routePreviewApi.previewTripPath?.(payload, options);
        },
        clearTripPathPreview: () => {
            dispatch(tripPreviewCleared({ source: 'searchMapBridge' }));
            return routePreviewApi.clearTripPathPreview?.();
        },
        clearTripPathPreviewBySource: (source) => {
            dispatch(tripPreviewCleared({ source: 'searchMapBridge', previewSource: source || null }));
            return routePreviewApi.clearTripPathPreviewBySource?.(source);
        },

        showJourneyPickPin: (payload = {}) => journeyPickApi.showJourneyPickPin?.(payload),
        clearJourneyPickPin: (type) => journeyPickApi.clearJourneyPickPin?.(type),
        onMapPickClick: (listener) => {
            if (typeof listener !== 'function') return journeyPickApi.onMapPickClick?.(listener);
            return journeyPickApi.onMapPickClick?.((event) => {
                recordMapClick(event);
                return listener(event);
            });
        },

        updateReachableStopsOverlay: (payload = {}) => {
            dispatch(reachableStopsUpdateRequested({ source: 'searchMapBridge', payload }));
            return reachableStopsApi.updateReachableStopsOverlay?.(payload);
        },
        clearReachableStopsOverlay: () => {
            dispatch(reachableStopsCleared({ source: 'searchMapBridge' }));
            return reachableStopsApi.clearReachableStopsOverlay?.();
        },

        clearStationSelection: () => selectionApi.clearStationSelection?.(),
        previewLine: (lineId) => selectionApi.previewLine?.(lineId),
        commitLine: (lineId) => selectionApi.commitLine?.(lineId),
        previewCompany: (companyName) => selectionApi.previewCompany?.(companyName),
        commitCompany: (companyName) => selectionApi.commitCompany?.(companyName),

        previewStation: (stationId, meta) => stationApi.previewStation?.(stationId, meta),
        commitStation: (stationId, meta) => stationApi.commitStation?.(stationId, meta),
        closeStationPopup: (options = {}) => stationApi.closeStationPopup?.(options)
    };
};

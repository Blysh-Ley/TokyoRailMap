import {
    mapClick,
    reachableStopsCleared,
    reachableStopsUpdateRequested
} from '../../store/actions.js';

export const createSearchMapBridge = ({
    hoverApi = {},
    journeyPickApi = {},
    multiSelectApi = {},
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

    const beginPreview = () => {
        if (typeof hoverApi.beginPreview === 'function') return hoverApi.beginPreview() === true;
        return hoverApi.beginHoverPreview?.() === true;
    };

    const endPreview = () => {
        if (typeof hoverApi.endPreview === 'function') return hoverApi.endPreview();
        return hoverApi.endHoverPreview?.();
    };

    const commitPreview = () => {
        if (typeof hoverApi.commitPreview === 'function') return hoverApi.commitPreview();
        return hoverApi.commitHoverPreview?.();
    };

    const getPreviewStatus = () => {
        if (typeof hoverApi.getPreviewStatus === 'function') return hoverApi.getPreviewStatus();
        return null;
    };

    return {
        isReady: false,

        snapshotSelectionState: () => stateApi.snapshotSelectionState?.(),
        restoreSelectionState: (snapshot) => stateApi.restoreSelectionState?.(snapshot),

        beginPreview,
        endPreview,
        commitPreview,
        getPreviewStatus,

        beginHoverPreview: beginPreview,
        endHoverPreview: endPreview,
        commitHoverPreview: commitPreview,

        previewTripPath: (payload, options = {}) => {
            return routePreviewApi.previewTripPath?.(payload, options);
        },
        clearTripPathPreview: () => {
            return routePreviewApi.clearTripPathPreview?.();
        },
        clearTripPathPreviewBySource: (source) => {
            return routePreviewApi.clearTripPathPreviewBySource?.(source);
        },

        isMultiSelectModeEnabled: () => (
            typeof multiSelectApi.isEnabled === 'function'
                ? multiSelectApi.isEnabled() === true
                : undefined
        ),
        runMultiSelectLayerCommand: (action, itemId) => (
            typeof multiSelectApi.runLayerCommand === 'function'
                ? multiSelectApi.runLayerCommand(action, itemId) === true
                : undefined
        ),

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

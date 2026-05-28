export const createLayerFeature = ({
    baseStationsGeoJSON,
    stationOffsetAlgorithmContext,
    buildStationOffsetGeoJSONAtZoom,
    getZoom,
    setStationsGeoJSON,
    updateStationLabelCoordinates,
    updateStationCircleCoordinates,
    rebuildStationCoordMap,
    setTransferCapsuleStationsData,
    invalidateTransferCapsules,
    getTransferCapsuleStationsData,
    getTransferCapsuleStationGroups,
    getTransferCapsuleBaseConnectionOrder,
    getTransferCapsuleVisibleKey,
    setTransferCapsuleVisibleKey,
    shouldUseFixedTransferCapsuleConnections,
    getFixedVisibleStationIdsForTransferCapsules,
    getVisibleStationIdsForTransferCapsules,
    toTransferCapsuleVisibleKey,
    buildTransferCapsuleGeoJSON,
    renderTransferCapsules,
    resolveTransferCapsuleLineColor,
    createCollisionController,
    collisionConfig = {},
    scheduleCollisionUpdate,
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame
} = {}) => {
    let currentStationOffsetStateKey = null;
    let transferCapsuleRefreshFrameId = null;

    const runInFrame = (callback) => {
        if (typeof requestFrame === 'function') return requestFrame(callback);
        return setTimeout(callback, 16);
    };

    const clearFrame = (frameId) => {
        if (frameId == null) return;
        if (typeof cancelFrame === 'function') cancelFrame(frameId);
        else clearTimeout(frameId);
    };

    const scheduleTransferCapsuleRefresh = () => {
        if (transferCapsuleRefreshFrameId != null) return;
        transferCapsuleRefreshFrameId = runInFrame(() => {
            transferCapsuleRefreshFrameId = null;
            refreshTransferCapsulesNow();
        });
    };

    const scheduleCollision = () => {
        scheduleCollisionUpdate?.();
    };

    const refreshTransferCapsulesNow = () => {
        const stationsData = getTransferCapsuleStationsData?.();
        const stationGroups = getTransferCapsuleStationGroups?.();
        if (!stationsData || !Array.isArray(stationGroups)) return false;

        const useFixedConnections = shouldUseFixedTransferCapsuleConnections?.() === true;
        const fixedVisibleStationIds = useFixedConnections
            ? getFixedVisibleStationIdsForTransferCapsules?.()
            : null;
        const visibleStationIds = useFixedConnections
            ? fixedVisibleStationIds
            : getVisibleStationIdsForTransferCapsules?.();
        const nextKey = toTransferCapsuleVisibleKey?.(visibleStationIds, {
            useFixedConnections,
            baseHiddenFilterActive: fixedVisibleStationIds instanceof Set
        });

        if (nextKey && nextKey === getTransferCapsuleVisibleKey?.()) return false;
        if (nextKey) setTransferCapsuleVisibleKey?.(nextKey);

        const transferCapsuleData = buildTransferCapsuleGeoJSON?.(stationsData, stationGroups, {
            visibleStationIds,
            fixedConnectionsByGroupId: useFixedConnections ? getTransferCapsuleBaseConnectionOrder?.() : null,
            singleStationFallbackCircle: true,
            resolveLineColor: (lineId) => resolveTransferCapsuleLineColor?.(lineId) || ''
        });
        if (!transferCapsuleData) return false;

        renderTransferCapsules?.(transferCapsuleData);
        return true;
    };

    const setupCollisionController = ({ stationLabels, stationCircles } = {}) => {
        if (typeof createCollisionController !== 'function') return null;
        return createCollisionController(stationLabels, stationCircles, {
            gridCellPx: 80,
            lowZoomLabelThinMaxZoom: 13,
            lowZoomLabelKeepRatio: 1,
            lineFilterTarget: 'labels',
            ...collisionConfig
        });
    };

    const applyStationGeoJSON = (geojson, keyHint = '') => {
        const nextGeoJSON = geojson && typeof geojson === 'object' ? geojson : null;
        if (!nextGeoJSON) return false;

        setStationsGeoJSON?.(nextGeoJSON);
        updateStationLabelCoordinates?.(nextGeoJSON);
        updateStationCircleCoordinates?.(nextGeoJSON);
        rebuildStationCoordMap?.(nextGeoJSON);

        setTransferCapsuleStationsData?.(nextGeoJSON);
        invalidateTransferCapsules?.(String(keyHint || '__station-geojson__'));
        scheduleTransferCapsuleRefresh();
        scheduleCollision();
        return true;
    };

    const applyRealtimeStationOffsetForZoom = (zoom) => {
        const z = Number(zoom);
        if (!Number.isFinite(z)) return false;

        const stateKey = `offset-zoom:${z.toFixed(3)}`;
        if (stateKey === currentStationOffsetStateKey) return false;

        const nextGeoJSON = buildStationOffsetGeoJSONAtZoom?.({
            baseStationsGeoJSON,
            stationOffsetAlgorithmContext,
            zoom: z
        });

        if (!applyStationGeoJSON(nextGeoJSON, stateKey)) return false;
        currentStationOffsetStateKey = stateKey;
        return true;
    };

    const syncStationOffsetForTripPreviewState = ({ tripPreviewActive = false } = {}) => {
        if (tripPreviewActive) {
            const tripPreviewBaseKey = '__trip-preview-base__';
            if (currentStationOffsetStateKey === tripPreviewBaseKey) return false;
            if (!applyStationGeoJSON(baseStationsGeoJSON, tripPreviewBaseKey)) return false;
            currentStationOffsetStateKey = tripPreviewBaseKey;
            return true;
        }

        return applyRealtimeStationOffsetForZoom(getZoom?.());
    };

    const destroy = () => {
        clearFrame(transferCapsuleRefreshFrameId);
        transferCapsuleRefreshFrameId = null;
    };

    return {
        applyRealtimeStationOffsetForZoom,
        applyStationGeoJSON,
        destroy,
        invalidateTransferCapsules,
        refreshTransferCapsulesNow,
        scheduleCollisionUpdate: scheduleCollision,
        setupCollisionController,
        scheduleTransferCapsuleRefresh,
        syncStationOffsetForTripPreviewState
    };
};

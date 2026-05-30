export const createLayerFeature = ({
    baseStationsGeoJSON,
    stationOffsetAlgorithmContext,
    buildStationOffsetGeoJSONAtZoom,
    getZoom,
    updateStationsSourceData,
    updateStationLabelCoordinates,
    updateStationCircleCoordinates,
    rebuildStationCoordMap,
    syncTransferCapsuleStationsData,
    invalidateTransferCapsuleData,
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
    let pendingTransferCapsuleRefreshAfterCollision = false;
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

    const scheduleCollisionLayerRefresh = () => {
        scheduleCollision();
    };

    const resetTransferCapsuleVisibleKey = (keyHint = '__init__') => {
        setTransferCapsuleVisibleKey?.(String(keyHint || '__init__'));
    };

    const invalidateAndScheduleTransferCapsules = (keyHint = '__init__') => {
        resetTransferCapsuleVisibleKey(keyHint);
        scheduleTransferCapsuleRefresh();
    };

    const requestTransferCapsuleRefreshAfterCollision = (keyHint = '__init__') => {
        pendingTransferCapsuleRefreshAfterCollision = true;
        resetTransferCapsuleVisibleKey(keyHint);
    };

    const scheduleSelectionLayerRefresh = () => {
        scheduleCollision();
        scheduleTransferCapsuleRefresh();
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
        const onCircleCollisionResolved = collisionConfig.onCircleCollisionResolved;
        return createCollisionController(stationLabels, stationCircles, {
            gridCellPx: 80,
            lowZoomLabelThinMaxZoom: 13,
            lowZoomLabelKeepRatio: 1,
            lineFilterTarget: 'labels',
            ...collisionConfig,
            onCircleCollisionResolved: (payload) => {
                onCircleCollisionResolved?.(payload);
                if (!pendingTransferCapsuleRefreshAfterCollision) return;
                pendingTransferCapsuleRefreshAfterCollision = false;
                invalidateAndScheduleTransferCapsules('__init__');
            }
        });
    };

    const applyStationLayerGeoJSON = (geojson, keyHint = '') => {
        const nextGeoJSON = geojson && typeof geojson === 'object' ? geojson : null;
        if (!nextGeoJSON) return false;

        updateStationsSourceData?.(nextGeoJSON);
        updateStationLabelCoordinates?.(nextGeoJSON);
        updateStationCircleCoordinates?.(nextGeoJSON);
        rebuildStationCoordMap?.(nextGeoJSON);

        syncTransferCapsuleStationsData?.(nextGeoJSON);
        invalidateTransferCapsuleData?.(String(keyHint || '__station-geojson__'));
        scheduleTransferCapsuleRefresh();
        scheduleCollision();
        return true;
    };

    const syncStationOffsetForZoom = (zoom) => {
        const z = Number(zoom);
        if (!Number.isFinite(z)) return false;

        const stateKey = `offset-zoom:${z.toFixed(3)}`;
        if (stateKey === currentStationOffsetStateKey) return false;

        const nextGeoJSON = buildStationOffsetGeoJSONAtZoom?.({
            baseStationsGeoJSON,
            stationOffsetAlgorithmContext,
            zoom: z
        });

        if (!applyStationLayerGeoJSON(nextGeoJSON, stateKey)) return false;
        currentStationOffsetStateKey = stateKey;
        return true;
    };

    const syncStationOffsetForTripPreviewState = ({ tripPreviewActive = false } = {}) => {
        if (tripPreviewActive) {
            const tripPreviewBaseKey = '__trip-preview-base__';
            if (currentStationOffsetStateKey === tripPreviewBaseKey) return false;
            if (!applyStationLayerGeoJSON(baseStationsGeoJSON, tripPreviewBaseKey)) return false;
            currentStationOffsetStateKey = tripPreviewBaseKey;
            return true;
        }

        return syncStationOffsetForZoom(getZoom?.());
    };

    const destroy = () => {
        clearFrame(transferCapsuleRefreshFrameId);
        transferCapsuleRefreshFrameId = null;
    };

    return {
        applyStationLayerGeoJSON,
        destroy,
        invalidateAndScheduleTransferCapsules,
        refreshTransferCapsulesNow,
        requestTransferCapsuleRefreshAfterCollision,
        resetTransferCapsuleVisibleKey,
        scheduleCollisionLayerRefresh,
        scheduleSelectionLayerRefresh,
        setupCollisionController,
        scheduleTransferCapsuleRefresh,
        syncStationOffsetForZoom,
        syncStationOffsetForTripPreviewState
    };
};

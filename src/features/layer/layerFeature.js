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
    createStationOffsetRuntimeController,
    collisionConfig = {},
    initialStationOffsetMode = 'dynamic',
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame
} = {}) => {
    let collisionController = null;
    let currentStationOffsetVisualKey = null;
    let currentStationOffsetFinalKey = null;
    let currentStationOffsetGeoJSONKey = null;
    let currentStationOffsetGeoJSON = null;
    let pendingTransferCapsuleRefreshAfterCollision = false;
    let stationOffsetRuntimeController = null;
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
        collisionController?.scheduleUpdate?.();
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
        collisionController = createCollisionController(stationLabels, stationCircles, {
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
        return collisionController;
    };

    const applyStationLayerGeoJSON = (geojson, keyHint = '', options = {}) => {
        const nextGeoJSON = geojson && typeof geojson === 'object' ? geojson : null;
        if (!nextGeoJSON) return false;
        const phase = options?.phase === 'visual' ? 'visual' : 'final';
        const updateVisible = options?.updateVisible !== false;

        if (updateVisible) {
            updateStationsSourceData?.(nextGeoJSON);
            updateStationLabelCoordinates?.(nextGeoJSON);
            updateStationCircleCoordinates?.(nextGeoJSON);
        }

        if (phase === 'visual') return true;

        rebuildStationCoordMap?.(nextGeoJSON);
        syncTransferCapsuleStationsData?.(nextGeoJSON);
        invalidateTransferCapsuleData?.(String(keyHint || '__station-geojson__'));
        scheduleTransferCapsuleRefresh();
        scheduleCollision();
        return true;
    };

    const syncStationOffsetForZoom = (zoom, options = {}) => {
        const z = Number(zoom);
        if (!Number.isFinite(z)) return false;

        const stateKey = `offset-zoom:${z.toFixed(3)}`;
        const phase = options?.phase === 'visual' ? 'visual' : 'final';
        if (phase === 'visual' && stateKey === currentStationOffsetVisualKey) return false;
        if (phase === 'final' && stateKey === currentStationOffsetFinalKey) return false;

        const nextGeoJSON = currentStationOffsetGeoJSONKey === stateKey
            ? currentStationOffsetGeoJSON
            : buildStationOffsetGeoJSONAtZoom?.({
                baseStationsGeoJSON,
                stationOffsetAlgorithmContext,
                zoom: z
            });
        if (!nextGeoJSON) return false;

        const updateVisible = phase === 'visual' || stateKey !== currentStationOffsetVisualKey;
        if (!applyStationLayerGeoJSON(nextGeoJSON, stateKey, { phase, updateVisible })) return false;
        currentStationOffsetGeoJSON = nextGeoJSON;
        currentStationOffsetGeoJSONKey = stateKey;
        if (updateVisible) currentStationOffsetVisualKey = stateKey;
        if (phase === 'final') currentStationOffsetFinalKey = stateKey;
        return true;
    };

    const syncStationOffsetForTripPreviewState = () => {
        return syncStationOffsetForZoom(getZoom?.(), { phase: 'final', reason: 'trip-preview' });
    };

    const bindStationOffsetRuntime = ({ initialMode = initialStationOffsetMode } = {}) => {
        if (typeof createStationOffsetRuntimeController !== 'function') return null;
        stationOffsetRuntimeController?.destroy?.();
        stationOffsetRuntimeController = createStationOffsetRuntimeController({
            getZoom,
            initialMode,
            syncStationOffsetForZoom
        });
        stationOffsetRuntimeController.syncAtCurrentZoom?.();
        return stationOffsetRuntimeController;
    };

    const setStationOffsetMode = (mode, options = {}) => {
        if (stationOffsetRuntimeController?.setMode) {
            return stationOffsetRuntimeController.setMode(mode, options);
        }
        return String(mode || '').trim().toLowerCase() === 'performance' ? 'performance' : 'dynamic';
    };

    const destroy = () => {
        clearFrame(transferCapsuleRefreshFrameId);
        transferCapsuleRefreshFrameId = null;
        stationOffsetRuntimeController?.destroy?.();
        stationOffsetRuntimeController = null;
    };

    return {
        applyStationLayerGeoJSON,
        bindStationOffsetRuntime,
        destroy,
        invalidateAndScheduleTransferCapsules,
        refreshTransferCapsulesNow,
        requestTransferCapsuleRefreshAfterCollision,
        resetTransferCapsuleVisibleKey,
        scheduleCollisionLayerRefresh,
        scheduleSelectionLayerRefresh,
        setupCollisionController,
        setStationOffsetMode,
        scheduleTransferCapsuleRefresh,
        syncStationOffsetForZoom,
        syncStationOffsetForTripPreviewState
    };
};

const DEFAULT_STATION_LABEL_ZOOMEND_DELAY_MS = 50;

const normalizeDelayMs = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const createLayerFeature = ({
    baseStationsGeoJSON,
    stationOffsetAlgorithmContext,
    buildStationOffsetGeoJSONAtZoom,
    getZoom,
    updateStationsSourceData,
    updateStationLabelsSourceData,
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
    getViewportStationIdsForTransferCapsules,
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
    getStationLabelMode,
    initialStationOffsetMode = 'dynamic',
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
    stationLabelZoomEndDelayMs = DEFAULT_STATION_LABEL_ZOOMEND_DELAY_MS
} = {}) => {
    let collisionController = null;
    let currentStationOffsetVisualKey = null;
    let currentStationOffsetFinalKey = null;
    let currentStationOffsetGeoJSONKey = null;
    let currentStationOffsetGeoJSON = null;
    let pendingTransferCapsuleRefreshAfterCollision = false;
    let pendingStationLabelGeoJSON = null;
    let stationOffsetRuntimeController = null;
    let transferCapsuleRefreshFrameId = null;
    let stationLabelRefreshTimerId = null;
    const stationLabelZoomEndDelay = normalizeDelayMs(
        stationLabelZoomEndDelayMs,
        DEFAULT_STATION_LABEL_ZOOMEND_DELAY_MS
    );

    const runInFrame = (callback) => {
        if (typeof requestFrame === 'function') return requestFrame(callback);
        return setTimeout(callback, 16);
    };

    const clearFrame = (frameId) => {
        if (frameId == null) return;
        if (typeof cancelFrame === 'function') cancelFrame(frameId);
        else clearTimeout(frameId);
    };

    const clearStationLabelGeoJSONFlush = () => {
        if (stationLabelRefreshTimerId == null) return;
        if (typeof clearTimeoutFn === 'function') clearTimeoutFn(stationLabelRefreshTimerId);
        else clearTimeout(stationLabelRefreshTimerId);
        stationLabelRefreshTimerId = null;
    };

    const scheduleTransferCapsuleRefresh = () => {
        if (transferCapsuleRefreshFrameId != null) return;
        transferCapsuleRefreshFrameId = runInFrame(() => {
            transferCapsuleRefreshFrameId = null;
            refreshTransferCapsulesNow();
        });
    };

    const scheduleCollision = (options = {}) => {
        collisionController?.scheduleUpdate?.(options);
    };

    const isStationLabelHiddenMode = () => String(getStationLabelMode?.() || '').trim().toLowerCase() === 'off';

    const scheduleCollisionLayerRefresh = () => {
        if (!isStationLabelHiddenMode() && pendingStationLabelGeoJSON) {
            flushStationLabelGeoJSON();
            return;
        }
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

    const refreshTransferCapsulesNow = (options = {}) => {
        const stationsData = getTransferCapsuleStationsData?.();
        const stationGroups = getTransferCapsuleStationGroups?.();
        if (!stationsData || !Array.isArray(stationGroups)) return false;

        const useFixedConnections = shouldUseFixedTransferCapsuleConnections?.() === true;
        const viewportOnly = options?.viewportOnly === true;
        const viewportVisibleStationIds = viewportOnly ? getViewportStationIdsForTransferCapsules?.(stationsData) : null;
        const fixedVisibleStationIds = useFixedConnections
            ? getFixedVisibleStationIdsForTransferCapsules?.()
            : null;
        let visibleStationIds = useFixedConnections
            ? fixedVisibleStationIds
            : getVisibleStationIdsForTransferCapsules?.();

        if (viewportVisibleStationIds instanceof Set) {
            if (visibleStationIds instanceof Set) {
                const intersect = new Set();
                for (const id of visibleStationIds) {
                    const sid = String(id || '').trim();
                    if (sid && viewportVisibleStationIds.has(sid)) intersect.add(sid);
                }
                visibleStationIds = intersect;
            } else {
                visibleStationIds = viewportVisibleStationIds;
            }
        }

        const nextKey = toTransferCapsuleVisibleKey?.(visibleStationIds, {
            viewportOnly,
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

    const updateStationLabelLayerGeoJSON = (geojson) => {
        const nextGeoJSON = geojson && typeof geojson === 'object' ? geojson : null;
        if (!nextGeoJSON) return false;
        pendingStationLabelGeoJSON = null;
        updateStationLabelsSourceData?.(nextGeoJSON);
        updateStationLabelCoordinates?.(nextGeoJSON);
        return true;
    };

    const flushStationLabelGeoJSON = () => {
        clearStationLabelGeoJSONFlush();
        if (isStationLabelHiddenMode()) return false;
        const nextGeoJSON = pendingStationLabelGeoJSON || currentStationOffsetGeoJSON;
        if (!updateStationLabelLayerGeoJSON(nextGeoJSON)) return false;
        scheduleCollision();
        return true;
    };

    const scheduleStationLabelGeoJSONFlush = (delayMs = stationLabelZoomEndDelay) => {
        clearStationLabelGeoJSONFlush();
        if (isStationLabelHiddenMode()) return false;
        if (!pendingStationLabelGeoJSON) return false;

        const delay = normalizeDelayMs(delayMs, stationLabelZoomEndDelay);
        if (delay <= 0) return flushStationLabelGeoJSON();

        const schedule = typeof setTimeoutFn === 'function' ? setTimeoutFn : setTimeout;
        stationLabelRefreshTimerId = schedule(() => {
            stationLabelRefreshTimerId = null;
            flushStationLabelGeoJSON();
        }, delay);
        return true;
    };

    const applyStationLayerGeoJSON = (geojson, keyHint = '', options = {}) => {
        const nextGeoJSON = geojson && typeof geojson === 'object' ? geojson : null;
        if (!nextGeoJSON) return false;
        const phase = options?.phase === 'visual' ? 'visual' : 'final';
        const updateVisible = options?.updateVisible !== false;
        const deferStationLabels = options?.deferStationLabels === true;
        let stationLabelsUpdated = false;

        if (updateVisible) {
            clearStationLabelGeoJSONFlush();
            updateStationsSourceData?.(nextGeoJSON);
            updateStationCircleCoordinates?.(nextGeoJSON);
            if (deferStationLabels) pendingStationLabelGeoJSON = nextGeoJSON;
            else stationLabelsUpdated = updateStationLabelLayerGeoJSON(nextGeoJSON);
        }

        if (phase === 'visual') {
            syncTransferCapsuleStationsData?.(nextGeoJSON);
            refreshTransferCapsulesNow();
            return true;
        }

        rebuildStationCoordMap?.(nextGeoJSON);
        syncTransferCapsuleStationsData?.(nextGeoJSON);
        invalidateTransferCapsuleData?.(String(keyHint || '__station-geojson__'));
        scheduleTransferCapsuleRefresh();
        if (deferStationLabels) pendingStationLabelGeoJSON = nextGeoJSON;
        else if (!stationLabelsUpdated) updateStationLabelLayerGeoJSON(nextGeoJSON);
        scheduleCollision(deferStationLabels ? { interaction: true } : {});
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
        const reason = String(options?.reason || '').trim();
        const deferStationLabels = phase === 'visual'
            || reason === 'zoom'
            || reason === 'zoom-settling'
            || reason === 'zoomend';
        if (!applyStationLayerGeoJSON(nextGeoJSON, stateKey, { phase, updateVisible, deferStationLabels })) return false;
        currentStationOffsetGeoJSON = nextGeoJSON;
        currentStationOffsetGeoJSONKey = stateKey;
        if (updateVisible) currentStationOffsetVisualKey = stateKey;
        if (phase === 'final') currentStationOffsetFinalKey = stateKey;
        if (deferStationLabels && reason === 'zoomend') {
            scheduleStationLabelGeoJSONFlush();
        }
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
            onZoomActivity: clearStationLabelGeoJSONFlush,
            onDynamicZoomEnd: () => scheduleStationLabelGeoJSONFlush(),
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
        clearStationLabelGeoJSONFlush();
        pendingStationLabelGeoJSON = null;
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

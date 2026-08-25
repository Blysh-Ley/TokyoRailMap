const DEFAULT_STATION_LABEL_ZOOMEND_DELAY_MS = 50;
const DEFAULT_LOW_ZOOM_CAPSULE_INTERVAL_MS = 96;
const DEFAULT_HIGH_ZOOM_CAPSULE_THRESHOLD = 13;
const CIRCLE_FAST_PATH_STRATEGY = 'circle-fast-path';

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
    stationOffsetPerformanceProbe,
    collisionConfig = {},
    getStationLabelMode,
    initialStationOffsetMode = 'dynamic',
    stationOffsetVisualSyncStrategy = 'interval',
    stationOffsetVisualUpdateStrategy = 'legacy',
    stationOffsetHighZoomCapsuleThreshold = DEFAULT_HIGH_ZOOM_CAPSULE_THRESHOLD,
    stationOffsetLowZoomCapsuleIntervalMs = DEFAULT_LOW_ZOOM_CAPSULE_INTERVAL_MS,
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    nowFn,
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
    let lowZoomCapsuleRefreshTimerId = null;
    let pendingLowZoomCapsuleGeoJSON = null;
    let lastLowZoomCapsuleRefreshTime = Number.NEGATIVE_INFINITY;
    const useCircleFastPath = String(stationOffsetVisualUpdateStrategy || '').trim().toLowerCase()
        === CIRCLE_FAST_PATH_STRATEGY;
    const highZoomCapsuleThreshold = Number.isFinite(Number(stationOffsetHighZoomCapsuleThreshold))
        ? Number(stationOffsetHighZoomCapsuleThreshold)
        : DEFAULT_HIGH_ZOOM_CAPSULE_THRESHOLD;
    const lowZoomCapsuleInterval = normalizeDelayMs(
        stationOffsetLowZoomCapsuleIntervalMs,
        DEFAULT_LOW_ZOOM_CAPSULE_INTERVAL_MS
    );
    const stationLabelZoomEndDelay = normalizeDelayMs(
        stationLabelZoomEndDelayMs,
        DEFAULT_STATION_LABEL_ZOOMEND_DELAY_MS
    );
    const readNow = typeof nowFn === 'function'
        ? nowFn
        : (() => globalThis.performance?.now?.() ?? Date.now());

    const measureStationOffsetStage = (stageName, callback) => {
        if (typeof stationOffsetPerformanceProbe?.measure === 'function') {
            return stationOffsetPerformanceProbe.measure(stageName, callback);
        }
        return callback();
    };

    const recordStationOffsetSyncAttempt = (detail) => {
        stationOffsetPerformanceProbe?.recordSyncAttempt?.(detail);
    };

    stationOffsetPerformanceProbe?.setContext?.({
        baseStationFeatureCount: Array.isArray(baseStationsGeoJSON?.features)
            ? baseStationsGeoJSON.features.length
            : 0,
        offsetStationCount: Object.keys(
            stationOffsetAlgorithmContext?.stationLocalChainsById || {}
        ).length,
        unresolvedOffsetStationCount: Array.isArray(stationOffsetAlgorithmContext?.unresolvedStationIds)
            ? stationOffsetAlgorithmContext.unresolvedStationIds.length
            : 0,
        stationOffsetMode: String(initialStationOffsetMode || 'dynamic')
    });

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

    const clearLowZoomCapsuleRefresh = () => {
        if (lowZoomCapsuleRefreshTimerId != null) {
            if (typeof clearTimeoutFn === 'function') clearTimeoutFn(lowZoomCapsuleRefreshTimerId);
            else clearTimeout(lowZoomCapsuleRefreshTimerId);
        }
        lowZoomCapsuleRefreshTimerId = null;
        pendingLowZoomCapsuleGeoJSON = null;
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
        measureStationOffsetStage('schedule-collision', () => scheduleCollision());
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

        if (options?.force !== true && nextKey && nextKey === getTransferCapsuleVisibleKey?.()) return false;
        if (nextKey) setTransferCapsuleVisibleKey?.(nextKey);

        const transferCapsuleData = measureStationOffsetStage('build-transfer-capsules', () => (
            buildTransferCapsuleGeoJSON?.(stationsData, stationGroups, {
                visibleStationIds,
                fixedConnectionsByGroupId: useFixedConnections ? getTransferCapsuleBaseConnectionOrder?.() : null,
                singleStationFallbackCircle: true,
                resolveLineColor: (lineId) => resolveTransferCapsuleLineColor?.(lineId) || ''
            })
        ));
        if (!transferCapsuleData) return false;

        measureStationOffsetStage('render-transfer-capsules', () => {
            renderTransferCapsules?.(transferCapsuleData);
        });
        return true;
    };

    const syncAndRefreshTransferCapsules = (geojson, options = {}) => {
        if (!geojson) return false;
        measureStationOffsetStage('sync-transfer-capsule-data', () => {
            syncTransferCapsuleStationsData?.(geojson);
        });
        return refreshTransferCapsulesNow(options);
    };

    const flushLowZoomCapsuleRefresh = () => {
        if (!pendingLowZoomCapsuleGeoJSON) return false;
        const nextGeoJSON = pendingLowZoomCapsuleGeoJSON;
        pendingLowZoomCapsuleGeoJSON = null;
        lastLowZoomCapsuleRefreshTime = readNow();
        return syncAndRefreshTransferCapsules(nextGeoJSON, { force: true });
    };

    const scheduleLowZoomCapsuleRefresh = (geojson) => {
        pendingLowZoomCapsuleGeoJSON = geojson;
        const elapsed = readNow() - lastLowZoomCapsuleRefreshTime;
        if (lowZoomCapsuleRefreshTimerId == null && elapsed >= lowZoomCapsuleInterval) {
            return flushLowZoomCapsuleRefresh();
        }
        if (lowZoomCapsuleRefreshTimerId != null) return true;

        const schedule = typeof setTimeoutFn === 'function' ? setTimeoutFn : setTimeout;
        const delay = Math.max(0, lowZoomCapsuleInterval - Math.max(0, elapsed));
        lowZoomCapsuleRefreshTimerId = schedule(() => {
            lowZoomCapsuleRefreshTimerId = null;
            if (Number(getZoom?.()) > highZoomCapsuleThreshold) {
                pendingLowZoomCapsuleGeoJSON = null;
                return;
            }
            flushLowZoomCapsuleRefresh();
        }, delay);
        return true;
    };

    const refreshTransferCapsulesForVisualZoom = (geojson, zoom) => {
        if (Number(zoom) > highZoomCapsuleThreshold) {
            clearLowZoomCapsuleRefresh();
            return syncAndRefreshTransferCapsules(geojson, {
                viewportOnly: true,
                force: true
            });
        }
        return scheduleLowZoomCapsuleRefresh(geojson);
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
        measureStationOffsetStage('update-station-label-source', () => {
            updateStationLabelsSourceData?.(nextGeoJSON);
        });
        measureStationOffsetStage('update-station-label-markers', () => {
            updateStationLabelCoordinates?.(nextGeoJSON);
        });
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
            measureStationOffsetStage('update-stations-source', () => {
                updateStationsSourceData?.(nextGeoJSON);
            });
            measureStationOffsetStage('update-station-circles', () => {
                updateStationCircleCoordinates?.(nextGeoJSON);
            });
            if (deferStationLabels) pendingStationLabelGeoJSON = nextGeoJSON;
            else stationLabelsUpdated = updateStationLabelLayerGeoJSON(nextGeoJSON);
        }

        if (phase === 'visual') {
            if (useCircleFastPath) {
                pendingStationLabelGeoJSON = nextGeoJSON;
                refreshTransferCapsulesForVisualZoom(nextGeoJSON, options?.zoom);
                return true;
            }
            measureStationOffsetStage('sync-transfer-capsule-data', () => {
                syncTransferCapsuleStationsData?.(nextGeoJSON);
            });
            refreshTransferCapsulesNow();
            return true;
        }

        if (useCircleFastPath) {
            clearLowZoomCapsuleRefresh();
            lastLowZoomCapsuleRefreshTime = Number.NEGATIVE_INFINITY;
        }

        measureStationOffsetStage('rebuild-station-coordinate-map', () => {
            rebuildStationCoordMap?.(nextGeoJSON);
        });
        if (useCircleFastPath) {
            syncAndRefreshTransferCapsules(nextGeoJSON, { force: true });
        } else {
            measureStationOffsetStage('sync-transfer-capsule-data', () => {
                syncTransferCapsuleStationsData?.(nextGeoJSON);
            });
            measureStationOffsetStage('invalidate-transfer-capsule-data', () => {
                invalidateTransferCapsuleData?.(String(keyHint || '__station-geojson__'));
            });
            measureStationOffsetStage('schedule-transfer-capsule-refresh', () => {
                scheduleTransferCapsuleRefresh();
            });
        }
        if (deferStationLabels) pendingStationLabelGeoJSON = nextGeoJSON;
        else if (!stationLabelsUpdated) updateStationLabelLayerGeoJSON(nextGeoJSON);
        if (!useCircleFastPath || !deferStationLabels || isStationLabelHiddenMode()) {
            measureStationOffsetStage('schedule-collision', () => {
                scheduleCollision(deferStationLabels ? { interaction: true } : {});
            });
        }
        return true;
    };

    const syncStationOffsetForZoomImpl = (zoom, options = {}) => {
        const z = Number(zoom);
        const phase = options?.phase === 'visual' ? 'visual' : 'final';
        const reason = String(options?.reason || '').trim();
        const force = options?.force === true;
        const recordOutcome = (outcome) => recordStationOffsetSyncAttempt({
            zoom: z,
            phase,
            reason,
            outcome
        });
        if (!Number.isFinite(z)) {
            recordOutcome('invalid-zoom');
            return false;
        }

        const stateKey = `offset-zoom:${z.toFixed(3)}`;
        if (phase === 'visual' && stateKey === currentStationOffsetVisualKey) {
            recordOutcome('visual-key-hit');
            return false;
        }
        if (phase === 'final' && !force && stateKey === currentStationOffsetFinalKey) {
            recordOutcome('final-key-hit');
            return false;
        }

        const nextGeoJSON = currentStationOffsetGeoJSONKey === stateKey
            ? currentStationOffsetGeoJSON
            : measureStationOffsetStage('build-offset-geojson', () => (
                buildStationOffsetGeoJSONAtZoom?.({
                    baseStationsGeoJSON,
                    stationOffsetAlgorithmContext,
                    zoom: z
                })
            ));
        if (!nextGeoJSON) {
            recordOutcome('no-geojson');
            return false;
        }

        const updateVisible = phase === 'visual' || stateKey !== currentStationOffsetVisualKey;
        const deferStationLabels = phase === 'visual'
            || reason === 'zoom'
            || reason === 'zoom-settling'
            || reason === 'zoomend';
        const applied = measureStationOffsetStage('apply-station-layer-total', () => (
            applyStationLayerGeoJSON(nextGeoJSON, stateKey, {
                phase,
                updateVisible,
                deferStationLabels,
                zoom: z
            })
        ));
        if (!applied) {
            recordOutcome('apply-failed');
            return false;
        }
        currentStationOffsetGeoJSON = nextGeoJSON;
        currentStationOffsetGeoJSONKey = stateKey;
        if (updateVisible) currentStationOffsetVisualKey = stateKey;
        if (phase === 'final') currentStationOffsetFinalKey = stateKey;
        stationOffsetPerformanceProbe?.recordOffsetApplied?.({
            zoom: z,
            phase,
            reason,
            updateVisible
        });
        if (deferStationLabels && reason === 'zoomend') {
            scheduleStationLabelGeoJSONFlush();
        }
        recordOutcome('completed');
        return true;
    };

    const syncStationOffsetForZoom = (zoom, options = {}) => (
        measureStationOffsetStage('sync-total', () => syncStationOffsetForZoomImpl(zoom, options))
    );

    const syncStationOffsetForTripPreviewState = () => {
        return syncStationOffsetForZoom(getZoom?.(), { phase: 'final', reason: 'trip-preview' });
    };

    const bindStationOffsetRuntime = ({ initialMode = initialStationOffsetMode } = {}) => {
        if (typeof createStationOffsetRuntimeController !== 'function') return null;
        stationOffsetPerformanceProbe?.setContext?.({ stationOffsetMode: String(initialMode || 'dynamic') });
        stationOffsetRuntimeController?.destroy?.();
        stationOffsetRuntimeController = createStationOffsetRuntimeController({
            getZoom,
            initialMode,
            onZoomActivity: clearStationLabelGeoJSONFlush,
            onDynamicZoomEnd: () => scheduleStationLabelGeoJSONFlush(),
            requestFrame,
            cancelFrame,
            visualSyncStrategy: stationOffsetVisualSyncStrategy,
            ...(useCircleFastPath ? { finalSyncStrategy: 'zoomend-only' } : {}),
            syncStationOffsetForZoom
        });
        stationOffsetRuntimeController.syncAtCurrentZoom?.();
        return stationOffsetRuntimeController;
    };

    const setStationOffsetMode = (mode, options = {}) => {
        if (stationOffsetRuntimeController?.setMode) {
            const nextMode = stationOffsetRuntimeController.setMode(mode, options);
            stationOffsetPerformanceProbe?.setContext?.({ stationOffsetMode: nextMode });
            return nextMode;
        }
        const nextMode = String(mode || '').trim().toLowerCase() === 'performance' ? 'performance' : 'dynamic';
        stationOffsetPerformanceProbe?.setContext?.({ stationOffsetMode: nextMode });
        return nextMode;
    };

    const destroy = () => {
        clearFrame(transferCapsuleRefreshFrameId);
        transferCapsuleRefreshFrameId = null;
        clearStationLabelGeoJSONFlush();
        clearLowZoomCapsuleRefresh();
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

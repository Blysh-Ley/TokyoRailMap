const normalizeMode = (mode) => (
    String(mode || '').trim().toLowerCase() === 'performance'
        ? 'performance'
        : 'dynamic'
);

const DEFAULT_SETTLING_VELOCITY = 0.025;
const DEFAULT_ACTIVE_VISUAL_INTERVAL_MS = 48;
const DEFAULT_SETTLING_VISUAL_INTERVAL_MS = 16;
const DEFAULT_ACTIVE_FINAL_INTERVAL_MS = 144;
const DEFAULT_SETTLING_FINAL_INTERVAL_MS = 64;
const DEFAULT_VISUAL_SYNC_STRATEGY = 'interval';
const RAF_LATEST_VISUAL_SYNC_STRATEGY = 'raf-latest';
const DEFAULT_FINAL_SYNC_STRATEGY = 'interval';
const ZOOMEND_ONLY_FINAL_SYNC_STRATEGY = 'zoomend-only';

const normalizeDelay = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const normalizeZoomKey = (zoom) => {
    const z = Number(zoom);
    return Number.isFinite(z) ? z.toFixed(3) : '';
};

const normalizeVisualSyncStrategy = (strategy) => (
    String(strategy || '').trim().toLowerCase() === RAF_LATEST_VISUAL_SYNC_STRATEGY
        ? RAF_LATEST_VISUAL_SYNC_STRATEGY
        : DEFAULT_VISUAL_SYNC_STRATEGY
);

const normalizeFinalSyncStrategy = (strategy) => (
    String(strategy || '').trim().toLowerCase() === ZOOMEND_ONLY_FINAL_SYNC_STRATEGY
        ? ZOOMEND_ONLY_FINAL_SYNC_STRATEGY
        : DEFAULT_FINAL_SYNC_STRATEGY
);

export const createStationOffsetRuntimeController = ({
    getZoom = () => 0,
    initialMode = 'dynamic',
    mapEngine,
    onZoomActivity,
    onDynamicZoomEnd,
    nowFn,
    settlingVelocity = DEFAULT_SETTLING_VELOCITY,
    syncStationOffsetForZoom,
    activeVisualIntervalMs = DEFAULT_ACTIVE_VISUAL_INTERVAL_MS,
    settlingVisualIntervalMs = DEFAULT_SETTLING_VISUAL_INTERVAL_MS,
    activeFinalIntervalMs = DEFAULT_ACTIVE_FINAL_INTERVAL_MS,
    settlingFinalIntervalMs = DEFAULT_SETTLING_FINAL_INTERVAL_MS,
    visualSyncStrategy: requestedVisualSyncStrategy = DEFAULT_VISUAL_SYNC_STRATEGY,
    finalSyncStrategy: requestedFinalSyncStrategy = DEFAULT_FINAL_SYNC_STRATEGY,
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame
} = {}) => {
    if (!mapEngine || typeof mapEngine.on !== 'function') {
        throw new Error('stationOffsetRuntimeController requires mapEngine.on');
    }
    if (typeof syncStationOffsetForZoom !== 'function') {
        throw new Error('stationOffsetRuntimeController requires syncStationOffsetForZoom');
    }

    let mode = normalizeMode(initialMode);
    let lastVisualZoom = Number(getZoom());
    let lastFrameZoom = Number(getZoom());
    let lastFinalZoom = Number(getZoom());
    let lastFinalZoomKey = '';
    let lastVisualSyncTime = Number.NEGATIVE_INFINITY;
    let lastFinalSyncTime = 0;
    let pendingVisualFrameId = null;
    let pendingVisualFrameScheduled = false;
    let pendingVisualFrameGeneration = 0;
    let pendingVisualReason = 'zoom';
    let pendingVisualInterval = DEFAULT_ACTIVE_VISUAL_INTERVAL_MS;
    let pendingFinalInterval = DEFAULT_ACTIVE_FINAL_INTERVAL_MS;
    const unbinders = [];
    const nearIdleVelocity = normalizeDelay(settlingVelocity, DEFAULT_SETTLING_VELOCITY);
    const activeVisualInterval = normalizeDelay(activeVisualIntervalMs, DEFAULT_ACTIVE_VISUAL_INTERVAL_MS);
    const settlingVisualInterval = normalizeDelay(settlingVisualIntervalMs, DEFAULT_SETTLING_VISUAL_INTERVAL_MS);
    const activeFinalInterval = normalizeDelay(activeFinalIntervalMs, DEFAULT_ACTIVE_FINAL_INTERVAL_MS);
    const settlingFinalInterval = normalizeDelay(settlingFinalIntervalMs, DEFAULT_SETTLING_FINAL_INTERVAL_MS);
    const requestVisualFrame = typeof requestFrame === 'function' ? requestFrame : null;
    const cancelVisualFrame = typeof cancelFrame === 'function' ? cancelFrame : null;
    const visualSyncStrategy = normalizeVisualSyncStrategy(requestedVisualSyncStrategy) === RAF_LATEST_VISUAL_SYNC_STRATEGY
        && requestVisualFrame
        && cancelVisualFrame
        ? RAF_LATEST_VISUAL_SYNC_STRATEGY
        : DEFAULT_VISUAL_SYNC_STRATEGY;
    const finalSyncStrategy = normalizeFinalSyncStrategy(requestedFinalSyncStrategy);
    const notifyZoomActivity = typeof onZoomActivity === 'function' ? onZoomActivity : null;
    const notifyDynamicZoomEnd = typeof onDynamicZoomEnd === 'function' ? onDynamicZoomEnd : null;
    const readNow = typeof nowFn === 'function'
        ? nowFn
        : (() => {
            if (globalThis.performance && typeof globalThis.performance.now === 'function') {
                return globalThis.performance.now();
            }
            return Date.now();
        });

    const getCurrentZoom = () => {
        const zoom = Number(getZoom());
        return Number.isFinite(zoom) ? zoom : 0;
    };

    const syncFinalAtCurrentZoom = (reason = 'manual', { force = false } = {}) => {
        const zoom = getCurrentZoom();
        const key = normalizeZoomKey(zoom);
        if (!force && key && key === lastFinalZoomKey) return false;
        const syncOptions = { phase: 'final', reason };
        if (force) syncOptions.force = true;
        const synced = syncStationOffsetForZoom(zoom, syncOptions);
        lastVisualZoom = zoom;
        lastFrameZoom = zoom;
        lastFinalZoom = zoom;
        lastFinalSyncTime = readNow();
        if (key) lastFinalZoomKey = key;
        return synced;
    };

    const syncVisualAtCurrentZoom = (reason = 'zoom') => {
        const zoom = getCurrentZoom();
        const synced = syncStationOffsetForZoom(zoom, { phase: 'visual', reason });
        lastVisualZoom = zoom;
        lastVisualSyncTime = readNow();
        return synced;
    };

    const syncAtCurrentZoom = () => syncFinalAtCurrentZoom('manual');

    const isDynamicMode = () => mode !== 'performance';

    const cancelPendingVisualFrame = () => {
        pendingVisualFrameGeneration += 1;
        if (pendingVisualFrameScheduled && pendingVisualFrameId != null) {
            cancelVisualFrame?.(pendingVisualFrameId);
        }
        pendingVisualFrameId = null;
        pendingVisualFrameScheduled = false;
        pendingVisualReason = 'zoom';
        pendingVisualInterval = activeVisualInterval;
        pendingFinalInterval = activeFinalInterval;
    };

    const scheduleLatestVisualSync = ({ visualInterval, finalInterval, reason }) => {
        pendingVisualReason = reason;
        pendingVisualInterval = visualInterval;
        pendingFinalInterval = finalInterval;
        if (pendingVisualFrameScheduled) return;

        pendingVisualFrameScheduled = true;
        const generation = pendingVisualFrameGeneration;
        const frameId = requestVisualFrame?.(() => {
            if (generation !== pendingVisualFrameGeneration) return;
            pendingVisualFrameId = null;
            pendingVisualFrameScheduled = false;
            const latestReason = pendingVisualReason;
            const latestVisualInterval = pendingVisualInterval;
            const latestFinalInterval = pendingFinalInterval;
            pendingVisualReason = 'zoom';
            pendingVisualInterval = activeVisualInterval;
            pendingFinalInterval = activeFinalInterval;
            if (!isDynamicMode()) return;

            const now = readNow();
            if (now - lastVisualSyncTime < latestVisualInterval) return;

            const visualSynced = syncVisualAtCurrentZoom(latestReason);
            if (finalSyncStrategy === DEFAULT_FINAL_SYNC_STRATEGY
                && visualSynced
                && now - lastFinalSyncTime >= latestFinalInterval) {
                syncFinalAtCurrentZoom(latestReason);
            }
        });
        if (pendingVisualFrameScheduled && generation === pendingVisualFrameGeneration) {
            pendingVisualFrameId = frameId ?? null;
        }
    };

    const handleZoom = () => {
        const currentZoom = getCurrentZoom();
        notifyZoomActivity?.({ zoom: currentZoom });
        if (!isDynamicMode()) return;

        const frameVelocity = Math.abs(currentZoom - lastFrameZoom);
        const settlingCandidate = frameVelocity > 0 && frameVelocity < nearIdleVelocity;
        const visualIntervalForFrame = settlingCandidate ? settlingVisualInterval : activeVisualInterval;
        const finalIntervalForFrame = settlingCandidate ? settlingFinalInterval : activeFinalInterval;
        const now = readNow();
        lastFrameZoom = currentZoom;

        const reason = settlingCandidate ? 'zoom-settling' : 'zoom';
        if (visualSyncStrategy === RAF_LATEST_VISUAL_SYNC_STRATEGY) {
            scheduleLatestVisualSync({
                visualInterval: visualIntervalForFrame,
                finalInterval: finalIntervalForFrame,
                reason
            });
            return;
        }

        const visualSynced = now - lastVisualSyncTime >= visualIntervalForFrame
            ? syncVisualAtCurrentZoom(reason)
            : false;

        if (finalSyncStrategy === DEFAULT_FINAL_SYNC_STRATEGY
            && visualSynced
            && now - lastFinalSyncTime >= finalIntervalForFrame) {
            syncFinalAtCurrentZoom(reason);
        }
    };

    const handleZoomEnd = () => {
        if (isDynamicMode()) {
            if (visualSyncStrategy === RAF_LATEST_VISUAL_SYNC_STRATEGY) {
                cancelPendingVisualFrame();
                if (normalizeZoomKey(getCurrentZoom()) !== normalizeZoomKey(lastVisualZoom)) {
                    syncVisualAtCurrentZoom('zoomend');
                }
            }
            if (visualSyncStrategy === RAF_LATEST_VISUAL_SYNC_STRATEGY
                || finalSyncStrategy === ZOOMEND_ONLY_FINAL_SYNC_STRATEGY) {
                syncFinalAtCurrentZoom('zoomend', {
                    force: finalSyncStrategy === ZOOMEND_ONLY_FINAL_SYNC_STRATEGY
                });
            }
            notifyDynamicZoomEnd?.({ zoom: getCurrentZoom() });
            return;
        }
        syncFinalAtCurrentZoom('zoomend');
    };

    const bind = () => {
        mapEngine.on('zoom', handleZoom);
        mapEngine.on('zoomend', handleZoomEnd);
        unbinders.push(() => mapEngine.off?.('zoom', handleZoom));
        unbinders.push(() => mapEngine.off?.('zoomend', handleZoomEnd));
    };

    const setMode = (nextMode, { sync = true } = {}) => {
        cancelPendingVisualFrame();
        mode = normalizeMode(nextMode);
        lastVisualSyncTime = Number.NEGATIVE_INFINITY;
        if (sync) syncAtCurrentZoom();
        return mode;
    };

    const destroy = () => {
        cancelPendingVisualFrame();
        while (unbinders.length) {
            const unbind = unbinders.pop();
            try {
                unbind?.();
            } catch {
                // ignore
            }
        }
    };

    bind();

    return {
        destroy,
        getMode: () => mode,
        isDynamicMode,
        setMode,
        syncAtCurrentZoom
    };
};

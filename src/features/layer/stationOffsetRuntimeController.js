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

const normalizeDelay = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const normalizeZoomKey = (zoom) => {
    const z = Number(zoom);
    return Number.isFinite(z) ? z.toFixed(3) : '';
};

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
    settlingFinalIntervalMs = DEFAULT_SETTLING_FINAL_INTERVAL_MS
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
    const unbinders = [];
    const nearIdleVelocity = normalizeDelay(settlingVelocity, DEFAULT_SETTLING_VELOCITY);
    const activeVisualInterval = normalizeDelay(activeVisualIntervalMs, DEFAULT_ACTIVE_VISUAL_INTERVAL_MS);
    const settlingVisualInterval = normalizeDelay(settlingVisualIntervalMs, DEFAULT_SETTLING_VISUAL_INTERVAL_MS);
    const activeFinalInterval = normalizeDelay(activeFinalIntervalMs, DEFAULT_ACTIVE_FINAL_INTERVAL_MS);
    const settlingFinalInterval = normalizeDelay(settlingFinalIntervalMs, DEFAULT_SETTLING_FINAL_INTERVAL_MS);
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

    const syncFinalAtCurrentZoom = (reason = 'manual') => {
        const zoom = getCurrentZoom();
        const key = normalizeZoomKey(zoom);
        if (key && key === lastFinalZoomKey) return false;
        const synced = syncStationOffsetForZoom(zoom, { phase: 'final', reason });
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
        const visualSynced = now - lastVisualSyncTime >= visualIntervalForFrame
            ? syncVisualAtCurrentZoom(reason)
            : false;

        if (visualSynced && now - lastFinalSyncTime >= finalIntervalForFrame) {
            syncFinalAtCurrentZoom(reason);
        }
    };

    const handleZoomEnd = () => {
        if (isDynamicMode()) {
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
        mode = normalizeMode(nextMode);
        lastVisualSyncTime = Number.NEGATIVE_INFINITY;
        if (sync) syncAtCurrentZoom();
        return mode;
    };

    const destroy = () => {
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

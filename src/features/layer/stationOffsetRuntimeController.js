const normalizeMode = (mode) => (
    String(mode || '').trim().toLowerCase() === 'performance'
        ? 'performance'
        : 'dynamic'
);

const DEFAULT_VISUAL_ZOOM_DELTA = 0.001;
const DEFAULT_SETTLING_VISUAL_ZOOM_DELTA = 0.001;
const DEFAULT_FINAL_ZOOM_DELTA = 0.16;
const DEFAULT_SETTLING_FINAL_ZOOM_DELTA = 0.025;
const DEFAULT_SETTLING_VELOCITY = 0.025;
const DEFAULT_SETTLING_DELAY_MS = 80;
const DEFAULT_IDLE_DELAY_MS = 140;

const normalizeDelay = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const normalizeZoomKey = (zoom) => {
    const z = Number(zoom);
    return Number.isFinite(z) ? z.toFixed(3) : '';
};

export const createStationOffsetRuntimeController = ({
    clearTimeoutFn = globalThis.clearTimeout,
    getZoom = () => 0,
    idleDelayMs = DEFAULT_IDLE_DELAY_MS,
    initialMode = 'dynamic',
    mapEngine,
    finalZoomDelta = DEFAULT_FINAL_ZOOM_DELTA,
    onDynamicZoomEnd,
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    settlingFinalZoomDelta = DEFAULT_SETTLING_FINAL_ZOOM_DELTA,
    settlingVelocity = DEFAULT_SETTLING_VELOCITY,
    settlingDelayMs = DEFAULT_SETTLING_DELAY_MS,
    setTimeoutFn = globalThis.setTimeout,
    syncStationOffsetForZoom,
    visualZoomDelta = DEFAULT_VISUAL_ZOOM_DELTA,
    settlingVisualZoomDelta = DEFAULT_SETTLING_VISUAL_ZOOM_DELTA
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
    let settleTimerId = null;
    let visualFrameId = null;
    let pendingVisualReason = '';
    const unbinders = [];
    const visualDelta = normalizeDelay(visualZoomDelta, DEFAULT_VISUAL_ZOOM_DELTA);
    const settlingVisualDelta = normalizeDelay(settlingVisualZoomDelta, DEFAULT_SETTLING_VISUAL_ZOOM_DELTA);
    const activeFinalDelta = normalizeDelay(finalZoomDelta, DEFAULT_FINAL_ZOOM_DELTA);
    const nearIdleFinalDelta = normalizeDelay(settlingFinalZoomDelta, DEFAULT_SETTLING_FINAL_ZOOM_DELTA);
    const nearIdleVelocity = normalizeDelay(settlingVelocity, DEFAULT_SETTLING_VELOCITY);
    const settlingDelay = normalizeDelay(settlingDelayMs, DEFAULT_SETTLING_DELAY_MS);
    const idleDelay = normalizeDelay(idleDelayMs, DEFAULT_IDLE_DELAY_MS);
    const notifyDynamicZoomEnd = typeof onDynamicZoomEnd === 'function' ? onDynamicZoomEnd : null;

    const getCurrentZoom = () => {
        const zoom = Number(getZoom());
        return Number.isFinite(zoom) ? zoom : 0;
    };

    const clearSettlingTimer = () => {
        if (settleTimerId == null) return;
        if (typeof clearTimeoutFn === 'function') clearTimeoutFn(settleTimerId);
        settleTimerId = null;
    };

    const runInFrame = (callback) => {
        if (typeof requestFrame === 'function') return requestFrame(callback);
        return setTimeoutFn(callback, 16);
    };

    const clearVisualFrame = () => {
        if (visualFrameId == null) return;
        if (typeof cancelFrame === 'function') cancelFrame(visualFrameId);
        else clearTimeoutFn(visualFrameId);
        visualFrameId = null;
        pendingVisualReason = '';
    };

    const syncFinalAtCurrentZoom = (reason = 'manual') => {
        clearVisualFrame();
        const zoom = getCurrentZoom();
        const key = normalizeZoomKey(zoom);
        if (key && key === lastFinalZoomKey) return false;
        const synced = syncStationOffsetForZoom(zoom, { phase: 'final', reason });
        lastVisualZoom = zoom;
        lastFrameZoom = zoom;
        lastFinalZoom = zoom;
        if (key) lastFinalZoomKey = key;
        return synced;
    };

    const syncVisualAtCurrentZoom = (reason = 'zoom') => {
        const zoom = getCurrentZoom();
        const synced = syncStationOffsetForZoom(zoom, { phase: 'visual', reason });
        lastVisualZoom = zoom;
        return synced;
    };

    const scheduleVisualAtCurrentZoom = (reason = 'zoom') => {
        pendingVisualReason = reason;
        if (visualFrameId != null) return;
        visualFrameId = runInFrame(() => {
            const reasonToRun = pendingVisualReason || 'zoom';
            visualFrameId = null;
            pendingVisualReason = '';
            if (!isDynamicMode()) return;
            syncVisualAtCurrentZoom(reasonToRun);
        });
    };

    const syncAtCurrentZoom = () => syncFinalAtCurrentZoom('manual');

    const isDynamicMode = () => mode !== 'performance';

    const handleZoom = () => {
        if (!isDynamicMode()) return;

        const currentZoom = getCurrentZoom();
        const frameVelocity = Math.abs(currentZoom - lastFrameZoom);
        const settlingCandidate = frameVelocity > 0 && frameVelocity < nearIdleVelocity;
        const visualDeltaForFrame = settlingCandidate ? settlingVisualDelta : visualDelta;
        const finalDeltaForFrame = settlingCandidate ? nearIdleFinalDelta : activeFinalDelta;
        const cumulativeVisualDelta = Math.abs(currentZoom - lastVisualZoom);
        const cumulativeFinalDelta = Math.abs(currentZoom - lastFinalZoom);
        lastFrameZoom = currentZoom;

        if (cumulativeVisualDelta >= visualDeltaForFrame) {
            scheduleVisualAtCurrentZoom(settlingCandidate ? 'zoom-settling' : 'zoom');
        }

        if (cumulativeFinalDelta >= finalDeltaForFrame) {
            syncFinalAtCurrentZoom(settlingCandidate ? 'zoom-settling' : 'zoom');
        }
    };

    const handleZoomEnd = () => {
        if (isDynamicMode()) {
            notifyDynamicZoomEnd?.({ zoom: getCurrentZoom() });
            return;
        }
        clearSettlingTimer();
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
        clearSettlingTimer();
        clearVisualFrame();
        if (sync) syncAtCurrentZoom();
        return mode;
    };

    const destroy = () => {
        clearSettlingTimer();
        clearVisualFrame();
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

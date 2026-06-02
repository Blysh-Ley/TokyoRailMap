const normalizeMode = (mode) => (
    String(mode || '').trim().toLowerCase() === 'performance'
        ? 'performance'
        : 'dynamic'
);

const DEFAULT_VISUAL_ZOOM_DELTA = 0.18;
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
    settlingDelayMs = DEFAULT_SETTLING_DELAY_MS,
    setTimeoutFn = globalThis.setTimeout,
    syncStationOffsetForZoom,
    visualZoomDelta = DEFAULT_VISUAL_ZOOM_DELTA
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
    let lastFinalZoomKey = '';
    let settleTimerId = null;
    const unbinders = [];
    const visualDelta = normalizeDelay(visualZoomDelta, DEFAULT_VISUAL_ZOOM_DELTA);
    const settlingDelay = normalizeDelay(settlingDelayMs, DEFAULT_SETTLING_DELAY_MS);
    const idleDelay = normalizeDelay(idleDelayMs, DEFAULT_IDLE_DELAY_MS);

    const getCurrentZoom = () => {
        const zoom = Number(getZoom());
        return Number.isFinite(zoom) ? zoom : 0;
    };

    const clearSettlingTimer = () => {
        if (settleTimerId == null) return;
        if (typeof clearTimeoutFn === 'function') clearTimeoutFn(settleTimerId);
        settleTimerId = null;
    };

    const syncFinalAtCurrentZoom = (reason = 'manual') => {
        const zoom = getCurrentZoom();
        const key = normalizeZoomKey(zoom);
        if (key && key === lastFinalZoomKey) return false;
        const synced = syncStationOffsetForZoom(zoom, { phase: 'final', reason });
        lastVisualZoom = zoom;
        lastFrameZoom = zoom;
        if (key) lastFinalZoomKey = key;
        return synced;
    };

    const syncVisualAtCurrentZoom = (reason = 'zoom') => {
        const zoom = getCurrentZoom();
        const synced = syncStationOffsetForZoom(zoom, { phase: 'visual', reason });
        lastVisualZoom = zoom;
        return synced;
    };

    const syncAtCurrentZoom = () => syncFinalAtCurrentZoom('manual');

    const isDynamicMode = () => mode !== 'performance';

    const scheduleSettlingSync = (delayMs, reason = 'settling') => {
        clearSettlingTimer();
        if (typeof setTimeoutFn !== 'function') return;
        settleTimerId = setTimeoutFn(() => {
            settleTimerId = null;
            syncFinalAtCurrentZoom(reason);
        }, delayMs);
    };

    const handleZoom = () => {
        if (!isDynamicMode()) return;

        const currentZoom = getCurrentZoom();
        const cumulativeDelta = Math.abs(currentZoom - lastVisualZoom);
        const frameVelocity = Math.abs(currentZoom - lastFrameZoom);
        lastFrameZoom = currentZoom;

        if (cumulativeDelta >= visualDelta) {
            syncVisualAtCurrentZoom('zoom');
        }

        const settlingCandidate = frameVelocity > 0 && frameVelocity < 0.02;
        scheduleSettlingSync(settlingCandidate ? settlingDelay : idleDelay, 'settling');
    };

    const handleZoomEnd = () => {
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
        if (sync) syncAtCurrentZoom();
        return mode;
    };

    const destroy = () => {
        clearSettlingTimer();
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

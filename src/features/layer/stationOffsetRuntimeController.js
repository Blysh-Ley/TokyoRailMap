const normalizeMode = (mode) => (
    String(mode || '').trim().toLowerCase() === 'performance'
        ? 'performance'
        : 'dynamic'
);

export const createStationOffsetRuntimeController = ({
    getZoom = () => 0,
    initialMode = 'dynamic',
    mapEngine,
    syncStationOffsetForZoom
} = {}) => {
    if (!mapEngine || typeof mapEngine.on !== 'function') {
        throw new Error('stationOffsetRuntimeController requires mapEngine.on');
    }
    if (typeof syncStationOffsetForZoom !== 'function') {
        throw new Error('stationOffsetRuntimeController requires syncStationOffsetForZoom');
    }

    let mode = normalizeMode(initialMode);
    let lastUpdateZoom = Number(getZoom());
    const unbinders = [];

    const getCurrentZoom = () => {
        const zoom = Number(getZoom());
        return Number.isFinite(zoom) ? zoom : 0;
    };

    const syncAtCurrentZoom = () => {
        const zoom = getCurrentZoom();
        const synced = syncStationOffsetForZoom(zoom);
        lastUpdateZoom = zoom;
        return synced;
    };

    const isDynamicMode = () => mode !== 'performance';

    const handleZoom = () => {
        if (!isDynamicMode()) return;

        const currentZoom = getCurrentZoom();
        const cumulativeDelta = Math.abs(currentZoom - lastUpdateZoom);

        if (cumulativeDelta >= 0.2) {
            syncStationOffsetForZoom(currentZoom);
            lastUpdateZoom = currentZoom;
        }
    };

    const handleZoomEnd = () => {
        syncAtCurrentZoom();
    };

    const bind = () => {
        mapEngine.on('zoom', handleZoom);
        mapEngine.on('zoomend', handleZoomEnd);
        unbinders.push(() => mapEngine.off?.('zoom', handleZoom));
        unbinders.push(() => mapEngine.off?.('zoomend', handleZoomEnd));
    };

    const setMode = (nextMode, { sync = true } = {}) => {
        mode = normalizeMode(nextMode);
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

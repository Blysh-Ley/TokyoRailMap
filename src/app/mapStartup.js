export const bindMapStartup = ({
    map,
    mapEngine,
    start,
    timeoutMs = 3000,
    setTimeoutFn = globalThis.setTimeout,
    onError = console.error
} = {}) => {
    if (!mapEngine || typeof start !== 'function') {
        throw new Error('bindMapStartup requires mapEngine and start');
    }

    let started = false;
    let queued = false;

    const isMapReady = () => Boolean(map?.loaded?.() || map?.isStyleLoaded?.());

    const startMapInit = (reason) => {
        if (started) return false;
        if (isMapReady()) {
            started = true;
            Promise.resolve(start(reason)).catch(onError);
            return true;
        }

        if (queued) return false;
        queued = true;
        mapEngine.once('styledata', () => {
            queued = false;
            startMapInit(reason || 'styledata');
        });
        return false;
    };

    mapEngine.on('load', () => startMapInit('load'));
    mapEngine.on('error', () => startMapInit('error'));
    setTimeoutFn(() => startMapInit('timeout'), timeoutMs);

    return {
        start: startMapInit,
        isStarted: () => started,
        isQueued: () => queued
    };
};

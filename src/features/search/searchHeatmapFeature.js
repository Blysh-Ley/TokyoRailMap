const normalizeStationId = (value) => String(value ?? '').trim();

const normalizeMinutes = (value) => {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 120) return 0;
    return minutes;
};

const defaultLoadReachableStops = async () => {
    const planner = await import('./travel-search-planner-raptor.js');
    return planner.getReachableStopsWithinMinutes;
};

export const createSearchHeatmapFeature = ({
    clearOverlay,
    loadReachableStops = defaultLoadReachableStops,
    opacity = 0.6,
    updateOverlay
} = {}) => {
    let requestToken = 0;
    let armedMinutes = 0;
    const listeners = new Set();

    const notify = (event) => {
        for (const listener of listeners) listener(event);
    };

    const clear = () => {
        requestToken += 1;
        armedMinutes = 0;
        clearOverlay?.();
        notify({ type: 'cleared', minutes: 0 });
    };

    const setMinutes = (minutes) => {
        const durationMinutes = normalizeMinutes(minutes);
        if (!durationMinutes) {
            clear();
            return 0;
        }
        requestToken += 1;
        armedMinutes = durationMinutes;
        notify({ type: 'armed', minutes: armedMinutes });
        return armedMinutes;
    };

    const draw = async ({ originStationId, minutes } = {}) => {
        const stationId = normalizeStationId(originStationId);
        const durationMinutes = normalizeMinutes(minutes);
        if (!stationId || !durationMinutes || durationMinutes !== armedMinutes) return false;

        const currentToken = ++requestToken;
        try {
            const getReachableStopsWithinMinutes = await loadReachableStops();
            if (typeof getReachableStopsWithinMinutes !== 'function') return false;

            const result = await getReachableStopsWithinMinutes({
                originStationId: stationId,
                minutes: durationMinutes
            });
            if (currentToken !== requestToken) return false;

            await updateOverlay?.({ ...result, opacity });
            if (currentToken !== requestToken || armedMinutes !== durationMinutes) return false;
            armedMinutes = 0;
            notify({
                type: 'drawn',
                minutes: 0,
                originStationId: stationId
            });
            return true;
        } catch {
            return false;
        }
    };

    const subscribe = (listener) => {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    return Object.freeze({
        clear,
        draw,
        setMinutes,
        subscribe
    });
};

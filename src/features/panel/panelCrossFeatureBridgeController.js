const noopProvider = () => null;

const callSafely = (fn) => {
    try {
        return fn();
    } catch {
        return null;
    }
};

export const createPanelCrossFeatureBridgeController = ({
    getJourneyUi = () => globalThis.window?.TokyoRailJourneyUI,
    getSearchMapActions = () => globalThis.window?.TokyoRailSearchMapActions,
    getTimePickerStateTarget = () => globalThis.window,
    getTimetableCache = () => globalThis.window?.TokyoRailTimetableCache
} = {}) => {
    const getJourney = typeof getJourneyUi === 'function' ? getJourneyUi : noopProvider;
    const getSearchActions = typeof getSearchMapActions === 'function' ? getSearchMapActions : noopProvider;
    const getTimeTarget = typeof getTimePickerStateTarget === 'function' ? getTimePickerStateTarget : noopProvider;
    const getCache = typeof getTimetableCache === 'function' ? getTimetableCache : noopProvider;

    const setJourneyStation = ({
        field,
        stationId,
        stationName
    } = {}) => callSafely(() => {
        const ui = getJourney();
        const methodName = field === 'destination' ? 'setDestinationStation' : 'setOriginStation';
        const method = ui?.[methodName];
        if (typeof method !== 'function') return false;
        method.call(ui, stationId, stationName, { expand: true, recompute: true });
        return true;
    }) === true;

    const clearStationSelection = () => callSafely(() => {
        const clear = getSearchActions()?.clearStationSelection;
        if (typeof clear !== 'function') return false;
        clear();
        return true;
    }) === true;

    const applyStationToJourneyField = (payload = {}) => {
        const appliedJourney = setJourneyStation(payload);
        const clearedSelection = clearStationSelection();
        return { appliedJourney, clearedSelection };
    };

    const clearTripPathPreviewBySource = (source) => callSafely(() => {
        const clear = getSearchActions()?.clearTripPathPreviewBySource;
        if (typeof clear !== 'function') return false;
        clear(source);
        return true;
    }) === true;

    const recomputeJourney = () => callSafely(() => {
        const recompute = getJourney()?.recompute;
        if (typeof recompute !== 'function') return false;
        recompute();
        return true;
    }) === true;

    const setTimePickerOpenState = (open) => callSafely(() => {
        const target = getTimeTarget();
        if (!target) return false;
        target.__TokyoRailTimePickerOpen = !!open;
        return true;
    }) === true;

    const loadTimetableForLineId = async (lineId) => {
        const id = String(lineId ?? '').trim();
        if (!id) return null;
        try {
            const cache = getCache();
            if (!cache) return null;
            const existing = cache.get?.(id);
            if (existing) return existing;
            await cache.preloadByLineIds?.([id]);
            return cache.get?.(id) || null;
        } catch {
            return null;
        }
    };

    return {
        applyStationToJourneyField,
        clearStationSelection,
        clearTripPathPreviewBySource,
        loadTimetableForLineId,
        recomputeJourney,
        setJourneyStation,
        setTimePickerOpenState
    };
};

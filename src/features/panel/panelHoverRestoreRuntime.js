const defaultToText = (value) => String(value ?? '').trim();

export const createPanelHoverRestoreRuntime = ({
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
    restoreDelayMs = 60,
    getLastAppliedHoverKey = () => null,
    setLastAppliedHoverKey = () => {},
    onRestoreStationLines = null,
    getCurrentStationServingIds = () => [],
    getCurrentStationId = () => null,
    toText = defaultToText
} = {}) => {
    let hoverTimerId = null;
    let restoreTimerId = null;

    const clearHoverTimer = () => {
        if (hoverTimerId != null) {
            clearTimeoutFn?.(hoverTimerId);
            hoverTimerId = null;
        }
    };

    const clearRestoreTimer = () => {
        if (restoreTimerId != null) {
            clearTimeoutFn?.(restoreTimerId);
            restoreTimerId = null;
        }
    };

    const restoreStationLinesIfNeeded = () => {
        if (!getLastAppliedHoverKey?.()) return;
        if (typeof onRestoreStationLines !== 'function') {
            setLastAppliedHoverKey(null);
            return;
        }
        try {
            onRestoreStationLines(
                Array.isArray(getCurrentStationServingIds?.()) ? getCurrentStationServingIds().slice() : [],
                { stationId: toText(getCurrentStationId?.()) || null }
            );
        } catch {
            // ignore restore failures during hover teardown
        }
        setLastAppliedHoverKey(null);
    };

    const scheduleRestoreStationLines = () => {
        if (!getLastAppliedHoverKey?.()) return;
        if (typeof onRestoreStationLines !== 'function') {
            setLastAppliedHoverKey(null);
            return;
        }
        clearRestoreTimer();
        restoreTimerId = setTimeoutFn?.(() => {
            restoreTimerId = null;
            restoreStationLinesIfNeeded();
        }, restoreDelayMs);
    };

    const scheduleHoverTimer = (callback, delayMs) => {
        clearHoverTimer();
        hoverTimerId = setTimeoutFn?.(() => {
            hoverTimerId = null;
            callback?.();
        }, delayMs);
        return hoverTimerId;
    };

    return {
        clearHoverTimer,
        clearRestoreTimer,
        restoreStationLinesIfNeeded,
        scheduleHoverTimer,
        scheduleRestoreStationLines
    };
};

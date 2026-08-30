const normalizeStationId = (value) => String(value ?? '').trim();

const normalizeMinutes = (value) => {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 120) return 0;
    return minutes;
};

const defaultLoadReachableStops = async () => {
    const planner = await import('./travel-search-planner-opportunity.js');
    return planner.getReachableStopsByDepartureOpportunity;
};

export const createSearchHeatmapFeature = ({
    clearOverlay,
    loadReachableStops = defaultLoadReachableStops,
    opacity = 0.6,
    updateOverlay
} = {}) => {
    let requestToken = 0;
    let armedMinutes = 0;
    let activeRequestController = null;
    let desiredOverlayPayload = null;
    let desiredOverlayToken = 0;
    const listeners = new Set();

    const notify = (event) => {
        for (const listener of listeners) listener(event);
    };

    const abortActiveRequest = () => {
        activeRequestController?.abort?.();
        activeRequestController = null;
    };

    const restoreDesiredOverlay = async () => {
        while (true) {
            const restoreToken = desiredOverlayToken;
            const restorePayload = desiredOverlayPayload;
            let restored = true;
            if (restorePayload) {
                restored = await updateOverlay?.(restorePayload) !== false;
            } else {
                restored = await clearOverlay?.() !== false;
            }
            if (!restored) throw new Error('Unable to restore the reachable-stops overlay');
            if (
                restoreToken === desiredOverlayToken &&
                restorePayload === desiredOverlayPayload
            ) {
                return;
            }
        }
    };

    const clear = () => {
        requestToken += 1;
        abortActiveRequest();
        armedMinutes = 0;
        let cleared = true;
        try {
            cleared = clearOverlay?.() !== false;
        } catch {
            cleared = false;
        }
        desiredOverlayToken = requestToken;
        desiredOverlayPayload = null;
        notify({ type: 'cleared', minutes: 0 });
        return cleared;
    };

    const setMinutes = (minutes) => {
        const durationMinutes = normalizeMinutes(minutes);
        if (!durationMinutes) {
            clear();
            return 0;
        }
        requestToken += 1;
        abortActiveRequest();
        armedMinutes = durationMinutes;
        desiredOverlayToken = requestToken;
        notify({ type: 'armed', minutes: armedMinutes });
        return armedMinutes;
    };

    const draw = async ({ originStationId, minutes, serviceDay = 'Weekday' } = {}) => {
        const stationId = normalizeStationId(originStationId);
        const durationMinutes = normalizeMinutes(minutes);
        if (!stationId || !durationMinutes || durationMinutes !== armedMinutes) return false;

        abortActiveRequest();
        const requestController = new AbortController();
        activeRequestController = requestController;
        const currentToken = ++requestToken;
        desiredOverlayToken = currentToken;
        try {
            const getReachableStopsByDepartureOpportunity = await loadReachableStops();
            if (
                typeof getReachableStopsByDepartureOpportunity !== 'function' ||
                requestController.signal.aborted ||
                currentToken !== requestToken
            ) return false;

            const result = await getReachableStopsByDepartureOpportunity({
                originStationId: stationId,
                minutes: durationMinutes,
                serviceDay,
                signal: requestController.signal
            });
            if (requestController.signal.aborted || currentToken !== requestToken) return false;

            const overlayPayload = { ...result, opacity };
            const previousDesiredOverlayPayload = desiredOverlayPayload;
            desiredOverlayToken = currentToken;
            desiredOverlayPayload = overlayPayload;
            let overlayError = null;
            try {
                const overlayUpdated = await updateOverlay?.(overlayPayload) !== false;
                if (!overlayUpdated) {
                    overlayError = new Error('Unable to update the reachable-stops overlay');
                }
            } catch (error) {
                overlayError = error;
            }
            if (
                requestController.signal.aborted ||
                currentToken !== requestToken ||
                armedMinutes !== durationMinutes
            ) {
                try {
                    await restoreDesiredOverlay();
                } catch {
                    // Keep the request stale even if restoring the latest overlay fails.
                }
                return false;
            }
            if (overlayError) {
                desiredOverlayToken = currentToken;
                desiredOverlayPayload = previousDesiredOverlayPayload;
                try {
                    await restoreDesiredOverlay();
                } catch {
                    // Preserve the previous overlay when the new paint fails.
                }
                return false;
            }
            armedMinutes = 0;
            notify({
                type: 'drawn',
                minutes: 0,
                originStationId: stationId
            });
            return true;
        } catch {
            return false;
        } finally {
            if (activeRequestController === requestController) {
                activeRequestController = null;
            }
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

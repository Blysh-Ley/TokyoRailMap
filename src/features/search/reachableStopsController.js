const REACHABLE_MINUTES_PATTERN = /^(\d+)(?:\s*[,，]\s*f)?$/i;
const REACHABLE_FAST_MODE_PATTERN = /[,，]\s*f/i;

export const createReachableStopsController = ({
    debounceMs = 500,
    getDepartureBase,
    getDestinationRaw,
    getOriginStationId,
    getReachableStopsWithinMinutes,
    getServiceDay,
    mapActions,
    normalizeText,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout
} = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();
    let timer = null;

    const clearTimer = () => {
        if (!timer) return;
        clearTimeoutFn?.(timer);
        timer = null;
    };

    const clearOverlay = () => {
        try {
            mapActions?.clearReachableStopsOverlay?.();
        } catch {
            // keep legacy search UI resilient while bridge is not ready
        }
    };

    const parseDestinationRaw = (rawValue) => {
        const raw = normalize(rawValue);
        const match = raw.match(REACHABLE_MINUTES_PATTERN);
        if (!match) return null;
        return {
            isFastMode: REACHABLE_FAST_MODE_PATTERN.test(raw),
            minutes: Number(match[1])
        };
    };

    const schedule = () => {
        clearTimer();

        const initialParsed = parseDestinationRaw(getDestinationRaw?.());
        if (!initialParsed) {
            clearOverlay();
            return;
        }

        const originStationId = normalize(getOriginStationId?.());
        if (!originStationId) {
            clearOverlay();
            return;
        }

        timer = setTimeoutFn?.(async () => {
            timer = null;

            const parsed = parseDestinationRaw(getDestinationRaw?.());
            if (!parsed) return;

            const queryOptions = {
                departureMs: getDepartureBase?.()?.departureMs,
                minutes: parsed.minutes,
                originStationId,
                serviceDay: getServiceDay?.()
            };

            if (parsed.isFastMode) {
                queryOptions.setTo8 = false;
                queryOptions.offsetsMin = [0];
            }

            try {
                const result = await getReachableStopsWithinMinutes?.(queryOptions);
                await mapActions?.updateReachableStopsOverlay?.({ ...result, opacity: 0.6 });
            } catch {
                // ignore legacy reachable overlay failures
            }
        }, debounceMs);
    };

    return Object.freeze({
        clear: () => {
            clearTimer();
            clearOverlay();
        },
        parseDestinationRaw,
        schedule
    });
};


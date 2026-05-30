const defaultNow = () => Date.now();

export const createJourneyRuntimeAdapter = ({
    runtime = globalThis,
    now = defaultNow
} = {}) => {
    const getRuntime = () => runtime || {};

    const setValue = (key, value) => {
        try {
            getRuntime()[key] = value;
        } catch {
            // ignore legacy global write failures
        }
    };

    const getNumber = (key) => {
        try {
            return Number(getRuntime()[key]) || 0;
        } catch {
            return 0;
        }
    };

    const setMultiSelectInternalMode = (enabled) => {
        try {
            const api = getRuntime().__TokyoRailMultiSelectInternalAPI;
            if (typeof api?.setEnabledSilent === 'function') {
                api.setEnabledSilent(enabled === true);
            }
            if (typeof api?.setForbidClass === 'function') {
                api.setForbidClass(enabled === true);
            }
        } catch {
            // ignore
        }
    };

    return Object.freeze({
        getJourneyUI: () => {
            try {
                return getRuntime().TokyoRailJourneyUI || null;
            } catch {
                return null;
            }
        },
        publishJourneyUI: (ui) => {
            setValue('TokyoRailJourneyUI', ui);
        },
        resetMapPickRuntimeFlags: () => {
            setValue('__TokyoRailJourneyMapPickActive', false);
            setValue('__TokyoRailSuppressStationSelectionUntil', 0);
        },
        setMapPickActive: (active) => {
            setValue('__TokyoRailJourneyMapPickActive', active === true);
        },
        suppressStationSelectionOnce: (ms = 700) => {
            const until = now() + Math.max(0, Number(ms) || 0);
            const prev = getNumber('__TokyoRailSuppressStationSelectionUntil');
            setValue('__TokyoRailSuppressStationSelectionUntil', Math.max(prev, until));
        },
        setMultiSelectInternalMode
    });
};

export const journeyRuntimeAdapter = createJourneyRuntimeAdapter();

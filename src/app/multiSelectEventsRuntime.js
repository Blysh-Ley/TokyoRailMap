export const MULTI_SELECT_EVENT = '__TokyoRailMultiSelectModeChanged';
export const MULTI_SELECT_LAYERS_EVENT = '__TokyoRailMultiSelectLayersUpdated';
export const MULTI_SELECT_LAYERS_COMMAND_EVENT = '__TokyoRailMultiSelectLayersCommand';
export const MULTI_SELECT_SHOW_ICONS_EVENT = '__TokyoRailMultiSelectShowIconsChanged';

const getDefaultWindow = () => (
    typeof window !== 'undefined' ? window : null
);

const createEvent = (target, eventName, detail) => {
    const EventCtor = typeof target?.CustomEvent === 'function'
        ? target.CustomEvent
        : (typeof CustomEvent === 'function' ? CustomEvent : null);
    return EventCtor
        ? new EventCtor(eventName, { detail })
        : { type: eventName, detail };
};

export const setMultiSelectGlobalEnabled = (target, enabled) => {
    try {
        if (!target) return false;
        target.__TokyoRailMultiSelectEnabled = enabled === true;
        return true;
    } catch {
        return false;
    }
};

export const createMultiSelectLayersUpdatedEmitter = ({
    target = getDefaultWindow(),
    getEnabled,
    getItems,
    now = Date.now
} = {}) => () => {
    try {
        if (!target || typeof target.dispatchEvent !== 'function') return false;
        target.dispatchEvent(createEvent(target, MULTI_SELECT_LAYERS_EVENT, {
            ts: now(),
            enabled: getEnabled?.() === true,
            items: getItems?.() || []
        }));
        return true;
    } catch {
        return false;
    }
};

export const registerMultiSelectModeInternalApi = ({
    target = getDefaultWindow(),
    setEnabledSilent
} = {}) => {
    try {
        if (!target) return false;
        target.__TokyoRailMultiSelectModeInternalAPI = {
            setEnabledSilent: (enabled) => setEnabledSilent?.(enabled === true)
        };
        return true;
    } catch {
        return false;
    }
};

export const bindMultiSelectModeEvents = ({
    target = getDefaultWindow(),
    getInitialEnabled,
    resetEnabledState,
    applyEnabled,
    onShowIconsChanged
} = {}) => {
    const initialEnabled = getInitialEnabled?.() === true;
    resetEnabledState?.(false);
    applyEnabled?.(initialEnabled);

    target?.addEventListener?.(MULTI_SELECT_EVENT, (evt) => {
        applyEnabled?.(evt?.detail?.enabled === true);
    });

    target?.addEventListener?.(MULTI_SELECT_SHOW_ICONS_EVENT, () => {
        onShowIconsChanged?.();
    });

    return {
        initialEnabled
    };
};

export const bindMultiSelectLayerCommandRuntime = ({
    target = getDefaultWindow(),
    emitLayersUpdated,
    runCommand
} = {}) => {
    try {
        if (target) {
            target.__TokyoRailMultiSelectLayerControl = {
                runCommand: (action, itemId) => runCommand?.(action, itemId),
                requestSync: () => emitLayersUpdated?.()
            };
        }
    } catch {
        // ignore
    }

    target?.addEventListener?.(MULTI_SELECT_LAYERS_COMMAND_EVENT, (evt) => {
        const action = String(evt?.detail?.action || '').trim();
        const itemId = String(evt?.detail?.id || '').trim();
        if (!action || !itemId) return;
        runCommand?.(action, itemId);
    });
};

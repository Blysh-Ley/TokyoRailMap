const BASE_HIGHLIGHT_UPDATED_EVENT = '__TokyoRailBaseHighlightUpdated';
const BASE_HIGHLIGHT_CLEARED_EVENT = '__TokyoRailBaseHighlightCleared';

const normalizeTarget = (target) => (
    target && typeof target.dispatchEvent === 'function'
        ? target
        : null
);

export const createBaseHighlightEventBridge = ({ target = window } = {}) => {
    const eventTarget = normalizeTarget(target);

    const dispatch = (eventName, detail) => {
        if (!eventTarget) return false;
        try {
            eventTarget.dispatchEvent(new CustomEvent(eventName, detail === undefined ? undefined : { detail }));
            return true;
        } catch {
            return false;
        }
    };

    return {
        clear: () => dispatch(BASE_HIGHLIGHT_CLEARED_EVENT),
        update: (detail) => dispatch(BASE_HIGHLIGHT_UPDATED_EVENT, detail)
    };
};

export {
    BASE_HIGHLIGHT_CLEARED_EVENT,
    BASE_HIGHLIGHT_UPDATED_EVENT
};

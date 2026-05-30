const BASE_HIGHLIGHT_UPDATED_EVENT = '__TokyoRailBaseHighlightUpdated';
const BASE_HIGHLIGHT_CLEARED_EVENT = '__TokyoRailBaseHighlightCleared';

const normalizeTarget = (target) => (
    target && typeof target.dispatchEvent === 'function'
        ? target
        : null
);

const createTargetEvent = (target, eventName, detail) => {
    const EventCtor = target?.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
        return new EventCtor(eventName, detail === undefined ? undefined : { detail });
    }

    const doc = target?.document || globalThis.document;
    if (doc && typeof doc.createEvent === 'function') {
        const event = doc.createEvent('CustomEvent');
        event.initCustomEvent(eventName, false, false, detail);
        return event;
    }

    return null;
};

export const createBaseHighlightEventBridge = ({ target = window } = {}) => {
    const eventTarget = normalizeTarget(target);
    let latestSnapshot = null;

    const cloneSnapshot = (snapshot) => {
        if (!snapshot) return null;
        return {
            ...snapshot,
            lineIds: Array.isArray(snapshot.lineIds)
                ? snapshot.lineIds.map((id) => String(id)).filter(Boolean)
                : []
        };
    };

    const publishRuntime = () => {
        if (!eventTarget) return;
        try {
            eventTarget.TokyoRailBaseHighlightRuntime = {
                getSnapshot: () => cloneSnapshot(latestSnapshot)
            };
        } catch {
            // ignore
        }
    };

    const dispatch = (eventName, detail) => {
        if (!eventTarget) return false;
        try {
            const event = createTargetEvent(eventTarget, eventName, detail);
            if (!event) return false;
            eventTarget.dispatchEvent(event);
            return true;
        } catch {
            return false;
        }
    };

    return {
        clear: () => {
            latestSnapshot = null;
            publishRuntime();
            return dispatch(BASE_HIGHLIGHT_CLEARED_EVENT);
        },
        getSnapshot: () => cloneSnapshot(latestSnapshot),
        update: (detail) => {
            latestSnapshot = cloneSnapshot(detail);
            publishRuntime();
            return dispatch(BASE_HIGHLIGHT_UPDATED_EVENT, latestSnapshot);
        }
    };
};

export {
    BASE_HIGHLIGHT_CLEARED_EVENT,
    BASE_HIGHLIGHT_UPDATED_EVENT
};

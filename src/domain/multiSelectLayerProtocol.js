const toText = (value) => String(value ?? '').trim();

export const MULTI_SELECT_LAYER_SCOPE_BASE = 'base';
export const MULTI_SELECT_LAYER_SCOPE_TRIP = 'trip';

export const MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY = 'toggle-visibility';
export const MULTI_SELECT_LAYER_ACTION_REMOVE = 'remove';
export const MULTI_SELECT_LAYER_ACTION_TOGGLE_BRANCH_PREVIEW = 'toggle-branch-preview';
export const MULTI_SELECT_LAYER_ACTION_SPLIT_COMPANY = 'split-company';

export const BASE_MULTI_SELECTION_LINE_KEY_PREFIX = 'line:';

const MULTI_SELECT_LAYER_ACTIONS = new Set([
    MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY,
    MULTI_SELECT_LAYER_ACTION_REMOVE,
    MULTI_SELECT_LAYER_ACTION_TOGGLE_BRANCH_PREVIEW,
    MULTI_SELECT_LAYER_ACTION_SPLIT_COMPANY
]);

export const buildMultiSelectLayerItemId = (scope, key) => {
    const resolvedScope = toText(scope);
    const resolvedKey = toText(key);
    if (!resolvedScope || !resolvedKey) return '';
    return `${resolvedScope}:${resolvedKey}`;
};

export const buildBaseMultiSelectLayerItemId = (key) => (
    buildMultiSelectLayerItemId(MULTI_SELECT_LAYER_SCOPE_BASE, key)
);

export const buildTripPreviewLayerItemId = (key) => (
    buildMultiSelectLayerItemId(MULTI_SELECT_LAYER_SCOPE_TRIP, key)
);

export const parseMultiSelectLayerItemId = (id) => {
    const raw = toText(id);
    if (!raw) return null;
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex <= 0) return null;

    const scope = raw.slice(0, separatorIndex);
    const key = raw.slice(separatorIndex + 1);
    if (!key) return null;
    if (scope !== MULTI_SELECT_LAYER_SCOPE_BASE && scope !== MULTI_SELECT_LAYER_SCOPE_TRIP) {
        return null;
    }

    return { scope, key };
};

export const isMultiSelectLayerAction = (action) => (
    MULTI_SELECT_LAYER_ACTIONS.has(toText(action))
);

export const parseMultiSelectLayerCommand = ({ action, itemId } = {}) => {
    const resolvedAction = toText(action);
    if (!isMultiSelectLayerAction(resolvedAction)) return null;

    const parsedItem = parseMultiSelectLayerItemId(itemId);
    if (!parsedItem?.key) return null;

    return {
        action: resolvedAction,
        scope: parsedItem.scope,
        key: parsedItem.key
    };
};

export const getLineIdFromBaseMultiSelectKey = (key) => {
    const raw = toText(key);
    if (!raw.startsWith(BASE_MULTI_SELECTION_LINE_KEY_PREFIX)) return '';
    return toText(raw.slice(BASE_MULTI_SELECTION_LINE_KEY_PREFIX.length));
};

export const buildBaseMultiSelectLineKey = (lineId) => {
    const id = toText(lineId);
    return id ? `${BASE_MULTI_SELECTION_LINE_KEY_PREFIX}${id}` : '';
};

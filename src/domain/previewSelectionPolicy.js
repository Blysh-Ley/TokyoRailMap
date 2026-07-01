const toText = (value) => String(value ?? '').trim();

export const PREVIEW_CAPSULE_MODE_VIRTUAL = 'virtual';
export const PREVIEW_CAPSULE_MODE_NONE = 'none';

export const PREVIEW_SOURCE_KIND_MULTI_SELECT_BASE = 'multi-select-base';
export const PREVIEW_SOURCE_KIND_MULTI_SELECT_BRANCH = 'multi-select-branch';
export const PREVIEW_SOURCE_KIND_MENU_THROUGH = 'menu-through';
export const PREVIEW_SOURCE_KIND_ROUTE = 'route';

export const MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE = 'ms-base-trip-preview';
export const MULTI_SELECT_BRANCH_SOURCE_PREFIX = 'ms-line-branch:';
export const MENU_THROUGH_SOURCE_PREFIX = 'rw-menu-through:';

export const getPreviewSelectionSource = ({ entry, payload, trip } = {}) => (
    toText(entry?.source)
    || toText(payload?.previewSource)
    || toText(payload?.__previewSource)
    || toText(payload?.source)
    || toText(trip?.previewSource)
    || toText(trip?.__previewSource)
    || toText(trip?.source)
);

export const buildMultiSelectBranchSource = (lineId) => {
    const id = toText(lineId);
    return id ? `${MULTI_SELECT_BRANCH_SOURCE_PREFIX}${id}` : '';
};

export const buildMenuThroughSource = (lineId) => {
    const id = toText(lineId);
    return id ? `${MENU_THROUGH_SOURCE_PREFIX}${id}` : '';
};

export const getLineIdFromMenuThroughSource = (source) => {
    const raw = toText(source);
    if (!raw.startsWith(MENU_THROUGH_SOURCE_PREFIX)) return '';
    return toText(raw.slice(MENU_THROUGH_SOURCE_PREFIX.length));
};

export const classifyPreviewSelectionSource = (source) => {
    const resolvedSource = toText(source);
    if (resolvedSource === MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE) {
        return PREVIEW_SOURCE_KIND_MULTI_SELECT_BASE;
    }
    if (resolvedSource.startsWith(MULTI_SELECT_BRANCH_SOURCE_PREFIX)) {
        return PREVIEW_SOURCE_KIND_MULTI_SELECT_BRANCH;
    }
    if (resolvedSource.startsWith(MENU_THROUGH_SOURCE_PREFIX)) {
        return PREVIEW_SOURCE_KIND_MENU_THROUGH;
    }
    return PREVIEW_SOURCE_KIND_ROUTE;
};

export const getPreviewSelectionPolicy = ({ source, entry, payload, trip } = {}) => {
    const resolvedSource = toText(source) || getPreviewSelectionSource({ entry, payload, trip });
    const kind = classifyPreviewSelectionSource(resolvedSource);
    const isMultiSelectBranch = kind === PREVIEW_SOURCE_KIND_MULTI_SELECT_BRANCH;
    return {
        source: resolvedSource,
        kind,
        capsuleMode: isMultiSelectBranch ? PREVIEW_CAPSULE_MODE_NONE : PREVIEW_CAPSULE_MODE_VIRTUAL,
        participatesInCollisionLanes: !isMultiSelectBranch,
        showInLayerList: !isMultiSelectBranch
    };
};

export const resolvePreviewCapsuleMode = (options = {}) => (
    getPreviewSelectionPolicy(options).capsuleMode
);

export const shouldShowPreviewSelectionInLayerList = (options = {}) => (
    getPreviewSelectionPolicy(options).showInLayerList
);

export const shouldUsePreviewCollisionLane = (options = {}) => (
    getPreviewSelectionPolicy(options).participatesInCollisionLanes
);

export const ACTION_TYPES = Object.freeze({
    SELECTION_PREVIEW_LINE: 'selection/previewLine',
    SELECTION_COMMIT_LINE: 'selection/commitLine',
    SELECTION_PREVIEW_COMPANY: 'selection/previewCompany',
    SELECTION_COMMIT_COMPANY: 'selection/commitCompany',
    SELECTION_SELECT_STATION_LINES: 'selection/selectStationLines',
    SELECTION_CLEAR: 'selection/clear',
    HOVER_SET_ENABLED: 'hover/setEnabled'
});

export const selectionPreviewLine = (payload = {}) => ({
    type: ACTION_TYPES.SELECTION_PREVIEW_LINE,
    payload
});

export const selectionCommitLine = (payload = {}) => ({
    type: ACTION_TYPES.SELECTION_COMMIT_LINE,
    payload
});

export const selectionPreviewCompany = (payload = {}) => ({
    type: ACTION_TYPES.SELECTION_PREVIEW_COMPANY,
    payload
});

export const selectionCommitCompany = (payload = {}) => ({
    type: ACTION_TYPES.SELECTION_COMMIT_COMPANY,
    payload
});

export const selectionSelectStationLines = (payload = {}) => ({
    type: ACTION_TYPES.SELECTION_SELECT_STATION_LINES,
    payload
});

export const selectionClear = (payload = {}) => ({
    type: ACTION_TYPES.SELECTION_CLEAR,
    payload
});

export const hoverSetEnabled = (enabled) => ({
    type: ACTION_TYPES.HOVER_SET_ENABLED,
    payload: { enabled: enabled !== false }
});

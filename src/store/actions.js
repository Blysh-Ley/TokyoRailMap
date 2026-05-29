export const ACTION_TYPES = Object.freeze({
    SELECTION_PREVIEW_LINE: 'selection/previewLine',
    SELECTION_COMMIT_LINE: 'selection/commitLine',
    SELECTION_PREVIEW_COMPANY: 'selection/previewCompany',
    SELECTION_COMMIT_COMPANY: 'selection/commitCompany',
    SELECTION_SELECT_STATION_LINES: 'selection/selectStationLines',
    SELECTION_CLEAR: 'selection/clear',
    HOVER_SET_ENABLED: 'hover/setEnabled',
    MAP_CLICK: 'map/click',
    PANEL_OPEN_REQUESTED: 'panel/openRequested',
    TRIP_PREVIEW_REQUESTED: 'tripPreview/requested',
    TRIP_PREVIEW_CLEARED: 'tripPreview/cleared',
    REACHABLE_STOPS_UPDATE_REQUESTED: 'reachableStops/updateRequested',
    REACHABLE_STOPS_CLEARED: 'reachableStops/cleared',
    MULTI_SELECT_SET_ENABLED: 'multiSelect/setEnabled'
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

export const mapClick = (payload = {}) => ({
    type: ACTION_TYPES.MAP_CLICK,
    payload
});

export const panelOpenRequested = (payload = {}) => ({
    type: ACTION_TYPES.PANEL_OPEN_REQUESTED,
    payload
});

export const tripPreviewRequested = (payload = {}) => ({
    type: ACTION_TYPES.TRIP_PREVIEW_REQUESTED,
    payload
});

export const tripPreviewCleared = (payload = {}) => ({
    type: ACTION_TYPES.TRIP_PREVIEW_CLEARED,
    payload
});

export const reachableStopsUpdateRequested = (payload = {}) => ({
    type: ACTION_TYPES.REACHABLE_STOPS_UPDATE_REQUESTED,
    payload
});

export const reachableStopsCleared = (payload = {}) => ({
    type: ACTION_TYPES.REACHABLE_STOPS_CLEARED,
    payload
});

export const multiSelectSetEnabled = (enabled) => ({
    type: ACTION_TYPES.MULTI_SELECT_SET_ENABLED,
    payload: { enabled: enabled === true }
});

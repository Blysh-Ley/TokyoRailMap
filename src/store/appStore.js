import { ACTION_TYPES } from './actions.js';
import { normalizeSelectionState } from '../domain/selection.js';

const defaultState = normalizeSelectionState({
    selectedServiceMode: 'all',
    hoverPreviewEnabled: true
});

const normalizeAppState = (state = {}) => ({
    ...normalizeSelectionState(state),
    multiSelectEnabled: state.multiSelectEnabled === true,
    mobileKeyboardVisible: state.mobileKeyboardVisible === true,
    stationVisualHighlightId: String(state.stationVisualHighlightId ?? '').trim() || null,
    lastInteraction: state.lastInteraction || null
});

const recordInteraction = (state, action = {}) => normalizeAppState({
    ...state,
    lastInteraction: {
        type: action.type || '',
        payload: action.payload || null
    }
});

const reduceSelection = (state, payload = {}) => normalizeSelectionState({
    ...state,
    selectedCompany: payload.selectedCompany ?? null,
    selectedLineId: payload.selectedLineId ?? null,
    selectedStationLineIds: payload.selectedStationLineIds ?? null,
    selectedStationId: payload.selectedStationId ?? null,
    selectedServiceMode: payload.selectedServiceMode || 'all'
});

const reducer = (state, action = {}) => {
    switch (action.type) {
        case ACTION_TYPES.SELECTION_PREVIEW_LINE:
        case ACTION_TYPES.SELECTION_COMMIT_LINE:
        case ACTION_TYPES.SELECTION_PREVIEW_COMPANY:
        case ACTION_TYPES.SELECTION_COMMIT_COMPANY:
        case ACTION_TYPES.SELECTION_SELECT_STATION_LINES:
            return recordInteraction({
                ...reduceSelection(state, action.payload),
                multiSelectEnabled: state.multiSelectEnabled,
                mobileKeyboardVisible: state.mobileKeyboardVisible,
                stationVisualHighlightId: state.stationVisualHighlightId
            }, action);

        case ACTION_TYPES.SELECTION_CLEAR:
            if (action.payload?.stationOnly === true) {
                return recordInteraction({
                    ...state,
                    selectedStationLineIds: null,
                    selectedStationId: null,
                    stationVisualHighlightId: null
                }, action);
            }
            return recordInteraction({
                ...state,
                selectedCompany: null,
                selectedLineId: null,
                selectedStationLineIds: null,
                selectedStationId: null,
                selectedServiceMode: 'all',
                stationVisualHighlightId: null
            }, action);

        case ACTION_TYPES.STATION_VISUAL_HIGHLIGHT_SET:
            return recordInteraction({
                ...state,
                stationVisualHighlightId: String(action.payload?.stationId ?? '').trim() || null
            }, action);

        case ACTION_TYPES.HOVER_SET_ENABLED:
            return normalizeAppState({
                ...state,
                hoverPreviewEnabled: action.payload?.enabled !== false
            });

        case ACTION_TYPES.HOVER_PREVIEW_BEGIN:
        case ACTION_TYPES.HOVER_PREVIEW_COMMIT:
        case ACTION_TYPES.HOVER_PREVIEW_RESTORE:
        case ACTION_TYPES.HOVER_PREVIEW_CLOSE:
            return recordInteraction(state, action);

        case ACTION_TYPES.MULTI_SELECT_SET_ENABLED:
            return recordInteraction({
                ...state,
                multiSelectEnabled: action.payload?.enabled === true
            }, action);

        case ACTION_TYPES.MOBILE_KEYBOARD_VISIBILITY_SET:
            return normalizeAppState({
                ...state,
                mobileKeyboardVisible: action.payload?.visible === true
            });

        case ACTION_TYPES.MAP_CLICK:
        case ACTION_TYPES.PANEL_OPEN_REQUESTED:
        case ACTION_TYPES.TRIP_PREVIEW_REQUESTED:
        case ACTION_TYPES.TRIP_PREVIEW_CLEARED:
        case ACTION_TYPES.REACHABLE_STOPS_UPDATE_REQUESTED:
        case ACTION_TYPES.REACHABLE_STOPS_CLEARED:
            return recordInteraction(state, action);

        default:
            return state;
    }
};

export const createStore = (initialState = {}) => {
    let state = normalizeAppState({ ...defaultState, ...initialState });
    const listeners = new Set();

    return {
        getState() {
            return state;
        },
        dispatch(action) {
            const nextState = reducer(state, action);
            if (nextState === state) return action;
            state = nextState;
            listeners.forEach((listener) => listener(state, action));
            return action;
        },
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

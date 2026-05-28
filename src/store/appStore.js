import { ACTION_TYPES } from './actions.js';
import { normalizeSelectionState } from '../domain/selection.js';

const defaultState = normalizeSelectionState({
    selectedServiceMode: 'all',
    hoverPreviewEnabled: true
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
            return reduceSelection(state, action.payload);

        case ACTION_TYPES.SELECTION_CLEAR:
            if (action.payload?.stationOnly === true) {
                return normalizeSelectionState({
                    ...state,
                    selectedStationLineIds: null,
                    selectedStationId: null
                });
            }
            return normalizeSelectionState({
                ...state,
                selectedCompany: null,
                selectedLineId: null,
                selectedStationLineIds: null,
                selectedStationId: null,
                selectedServiceMode: 'all'
            });

        case ACTION_TYPES.HOVER_SET_ENABLED:
            return normalizeSelectionState({
                ...state,
                hoverPreviewEnabled: action.payload?.enabled !== false
            });

        default:
            return state;
    }
};

export const createStore = (initialState = {}) => {
    let state = normalizeSelectionState({ ...defaultState, ...initialState });
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

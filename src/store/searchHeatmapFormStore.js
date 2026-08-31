export const SEARCH_HEATMAP_MINUTE_OPTIONS = Object.freeze([15, 30, 45, 60, 90, 120]);

const normalizeText = (value) => String(value ?? '').trim();

export const createSearchHeatmapFormInitialState = () => ({
    open: false,
    visible: false,
    resumeOnSearch: false,
    text: '',
    station: null,
    minutes: 0,
    picking: false,
    status: 'idle',
    items: [],
    suggestionsVisible: false,
    error: ''
});

export const reduceSearchHeatmapFormState = (state, action = {}) => {
    const current = state || createSearchHeatmapFormInitialState();
    switch (action.type) {
        case 'open':
            return current.open
                ? { ...current, visible: true, resumeOnSearch: false }
                : { ...createSearchHeatmapFormInitialState(), open: true, visible: true };
        case 'suspend':
            return {
                ...current,
                visible: false,
                resumeOnSearch: action.payload?.navigation === true && (current.visible || current.resumeOnSearch),
                picking: false,
                suggestionsVisible: false
            };
        case 'close':
            return createSearchHeatmapFormInitialState();
        case 'text':
            return {
                ...current,
                text: String(action.payload?.text ?? action.payload ?? ''),
                station: null,
                picking: false,
                status: 'idle',
                items: [],
                suggestionsVisible: false,
                error: ''
            };
        case 'selectStation': {
            const id = normalizeText(action.payload?.id);
            const text = normalizeText(action.payload?.text) || id;
            if (!text) return current;
            return {
                ...current,
                text,
                station: id ? { id, text } : null,
                picking: false,
                status: action.payload?.keepStatus === true ? current.status : 'idle',
                items: [],
                suggestionsVisible: false,
                error: ''
            };
        }
        case 'minutes': {
            const minutes = Number(action.payload?.minutes ?? action.payload);
            if (!SEARCH_HEATMAP_MINUTE_OPTIONS.includes(minutes)) return current;
            return { ...current, minutes, status: 'idle', error: '' };
        }
        case 'picking':
            return {
                ...current,
                picking: action.payload?.picking === true,
                suggestionsVisible: false,
                error: ''
            };
        case 'suggestions':
            return {
                ...current,
                items: Array.isArray(action.payload?.items) ? action.payload.items : [],
                suggestionsVisible: action.payload?.visible === true
            };
        case 'hideSuggestions':
            return { ...current, suggestionsVisible: false };
        case 'status': {
            const status = normalizeText(action.payload?.status);
            if (!['idle', 'loading', 'drawn', 'error'].includes(status)) return current;
            return {
                ...current,
                status,
                picking: status === 'loading' ? false : current.picking,
                suggestionsVisible: status === 'loading' ? false : current.suggestionsVisible,
                error: status === 'error' ? normalizeText(action.payload?.error) : ''
            };
        }
        default:
            return current;
    }
};

export const createSearchHeatmapFormStore = () => {
    let state = createSearchHeatmapFormInitialState();
    const listeners = new Set();
    return {
        getState: () => state,
        dispatch(action) {
            const nextState = reduceSearchHeatmapFormState(state, action);
            if (nextState !== state) {
                state = nextState;
                for (const listener of listeners) listener(state, action);
            }
            return action;
        },
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

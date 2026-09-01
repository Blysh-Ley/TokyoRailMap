import {
    createSearchHeatmapFormStore,
    SEARCH_HEATMAP_MINUTE_OPTIONS
} from '../../store/searchHeatmapFormStore.js';
import { STATION_SEARCH_ENTRY_TYPES } from '../../domain/searchEntries.js';

const normalizeText = (value) => String(value ?? '').trim();

const normalizeStationItems = (items) => (Array.isArray(items) ? items : [])
    .filter((item) => item && (!item.type || item.type === 'station'))
    .map((item) => ({ ...item, type: 'station', id: normalizeText(item.id), text: normalizeText(item.text) }))
    .filter((item) => item.id && item.text);

const normalizeHistoryItems = (items) => (Array.isArray(items) ? items : [])
    .map((item) => typeof item === 'string' ? { type: 'text', text: item } : item)
    .filter((item) => item && (!item.type || item.type === 'station' || item.type === 'text'))
    .map((item) => {
        const id = normalizeText(item.id);
        const type = id && item.type !== 'text' ? 'station' : 'text';
        return { ...item, type, id: type === 'station' ? id : undefined, text: normalizeText(item.text) };
    })
    .filter((item) => item.text);

// This feature owns asynchronous interaction policy; all visible form state lives in the store.
export const createSearchHeatmapInteraction = ({
    getActions,
    readEntries = null,
    searchStations = async () => [],
    loadHistory = () => [],
    addHistory = () => {}
} = {}) => {
    const store = createSearchHeatmapFormStore();
    let suggestionVersion = 0;
    let requestVersion = 0;

    const readStationEntries = (query = '') => {
        if (typeof readEntries === 'function') {
            return readEntries({
                query,
                limit: 20,
                allowedTypes: STATION_SEARCH_ENTRY_TYPES
            });
        }
        return query ? searchStations(query) : loadHistory();
    };

    const hideSuggestions = () => {
        suggestionVersion += 1;
        store.dispatch({ type: 'hideSuggestions' });
    };

    const saveHistory = (station) => {
        try {
            let existing = null;
            if (station.id) {
                const previousItems = loadHistory();
                if (Array.isArray(previousItems)) {
                    existing = previousItems.find((item) => (
                        item &&
                        (!item.type || item.type === 'station') &&
                        normalizeText(item.id) === station.id
                    )) || null;
                } else if (previousItems && typeof previousItems.catch === 'function') {
                    previousItems.catch(() => {});
                }
            }
            const item = station.id
                ? { ...existing, ...station, type: 'station', id: station.id, text: station.text }
                : station.text;
            const saved = addHistory(item);
            if (saved && typeof saved.catch === 'function') saved.catch(() => {});
        } catch {
            // A storage failure must not prevent selecting or drawing a station.
        }
    };

    const suggest = async () => {
        const state = store.getState();
        if (!state.open || !state.visible || state.status === 'loading') return false;
        const version = ++suggestionVersion;
        const query = normalizeText(state.text);
        try {
            const result = await readStationEntries(query);
            const current = store.getState();
            if (
                version !== suggestionVersion ||
                !current.open ||
                !current.visible ||
                normalizeText(current.text) !== query
            ) return false;
            store.dispatch({
                type: 'suggestions',
                payload: {
                    items: query ? normalizeStationItems(result) : normalizeHistoryItems(result),
                    visible: true
                }
            });
            return true;
        } catch {
            if (version === suggestionVersion) {
                store.dispatch({ type: 'suggestions', payload: { items: [], visible: false } });
            }
            return false;
        }
    };

    const submit = async () => {
        const initial = store.getState();
        if (!initial.open || initial.status === 'loading') return false;
        const query = normalizeText(initial.text);
        const minutes = initial.minutes;
        if ((!initial.station?.id && !query) || !SEARCH_HEATMAP_MINUTE_OPTIONS.includes(minutes)) {
            hideSuggestions();
            store.dispatch({
                type: 'status',
                payload: {
                    status: 'error',
                    error: !initial.station?.id && !query ? '请选择车站' : '请选择时间'
                }
            });
            return false;
        }

        const version = ++requestVersion;
        const isCurrent = () => version === requestVersion && store.getState().open;
        hideSuggestions();
        store.dispatch({ type: 'status', payload: { status: 'loading' } });
        try {
            let station = initial.station;
            if (!station?.id) {
                const items = normalizeStationItems(await readStationEntries(query));
                if (!isCurrent()) return false;
                station = items.find((item) => normalizeText(item.text) === query) || items[0] || null;
                if (!station) throw new Error('未找到匹配的车站');
                store.dispatch({
                    type: 'selectStation',
                    payload: { id: station.id, text: station.text, keepStatus: true }
                });
                saveHistory(station);
            }
            if (!isCurrent()) return false;
            const actions = getActions?.();
            if (
                typeof actions?.setReachableStopsHeatmapMinutes !== 'function' ||
                typeof actions?.drawReachableStopsHeatmap !== 'function'
            ) throw new Error('热力图尚未准备好，请重试');
            const armed = await actions.setReachableStopsHeatmapMinutes(minutes);
            if (!isCurrent()) return false;
            if (armed === false || armed === 0) throw new Error('热力图时间设置失败，请重试');
            const drawn = await actions.drawReachableStopsHeatmap({ originStationId: station.id, minutes });
            if (!isCurrent()) return false;
            if (drawn === false) throw new Error('热力图绘制失败，请重试');
            store.dispatch({ type: 'status', payload: { status: 'drawn' } });
            return true;
        } catch (error) {
            if (!isCurrent()) return false;
            store.dispatch({
                type: 'status',
                payload: { status: 'error', error: normalizeText(error?.message) || '热力图绘制失败，请重试' }
            });
            return false;
        }
    };

    const dispatch = (action = {}) => {
        const state = store.getState();
        switch (action.type) {
            case 'open':
                store.dispatch({ type: 'open' });
                return true;
            case 'suspend':
                suggestionVersion += 1;
                store.dispatch(action);
                return true;
            case 'close': {
                requestVersion += 1;
                suggestionVersion += 1;
                store.dispatch({ type: 'close' });
                try {
                    const cleared = getActions?.()?.clearReachableStopsOverlay?.();
                    if (cleared && typeof cleared.catch === 'function') cleared.catch(() => {});
                } catch {
                    // Closing must still reset the form if the map is unavailable.
                }
                return true;
            }
            case 'hideSuggestions':
                hideSuggestions();
                return true;
            case 'submit':
                return submit();
            default:
                break;
        }
        if (!state.open || state.status === 'loading') return false;
        switch (action.type) {
            case 'text':
                suggestionVersion += 1;
                store.dispatch(action);
                return suggest();
            case 'suggest':
                return suggest();
            case 'selectStation': {
                const id = normalizeText(action.payload?.id);
                const text = normalizeText(action.payload?.text) || id;
                if (!text) return false;
                suggestionVersion += 1;
                store.dispatch({ type: 'selectStation', payload: { id, text } });
                saveHistory({ ...action.payload, id, text });
                return true;
            }
            case 'minutes':
                store.dispatch(action);
                return true;
            case 'togglePick':
                hideSuggestions();
                store.dispatch({ type: 'picking', payload: { picking: !state.picking } });
                return true;
            default:
                return false;
        }
    };

    return Object.freeze({ getState: store.getState, subscribe: store.subscribe, dispatch });
};

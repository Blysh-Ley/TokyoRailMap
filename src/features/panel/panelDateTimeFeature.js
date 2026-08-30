import { buildPanelDateTimeViewModel } from '../../domain/panelDateTime.js';
import {
    createPanelDateTimeStore,
    PANEL_DATE_TIME_ACTION_TYPES
} from '../../store/panelDateTimeStore.js';

const noop = () => {};

export const createPanelDateTimeFeature = ({
    store = createPanelDateTimeStore(),
    getCurrentValue = () => ({}),
    getNowValue = () => ({}),
    getTodayDateKey = () => '',
    resolveServiceDayLabel = () => '',
    onCommit = noop,
    onResetNow = noop
} = {}) => {
    const listeners = new Set();
    let destroyed = false;

    const getViewModel = () => buildPanelDateTimeViewModel(store.getState(), {
        resolveServiceDayLabel,
        todayDateKey: getTodayDateKey()
    });

    const notify = (state, action) => {
        const viewModel = getViewModel();
        listeners.forEach((listener) => listener(viewModel, action));
        if (action?.type === PANEL_DATE_TIME_ACTION_TYPES.CONFIRM) {
            onCommit(state.committed);
        } else if (action?.type === PANEL_DATE_TIME_ACTION_TYPES.RESET_NOW) {
            onResetNow(state.committed);
        }
    };

    const unsubscribeStore = store.subscribe(notify);

    const dispatch = (action) => {
        if (destroyed || !action?.type) return action;
        return store.dispatch(action);
    };

    const open = () => dispatch({
        type: PANEL_DATE_TIME_ACTION_TYPES.OPEN,
        payload: getCurrentValue()
    });

    const cancel = () => dispatch({ type: PANEL_DATE_TIME_ACTION_TYPES.CANCEL });
    const confirm = () => dispatch({ type: PANEL_DATE_TIME_ACTION_TYPES.CONFIRM });
    const resetNow = () => dispatch({
        type: PANEL_DATE_TIME_ACTION_TYPES.RESET_NOW,
        payload: getNowValue()
    });

    const handleIntent = (intent = {}) => {
        switch (intent.type) {
            case 'open':
                return open();
            case 'cancel':
                return cancel();
            case 'confirm':
                return confirm();
            case 'resetNow':
                return resetNow();
            case 'selectDate':
                return dispatch({
                    type: PANEL_DATE_TIME_ACTION_TYPES.SELECT_DATE,
                    payload: { dateKey: intent.dateKey }
                });
            case 'selectHour':
                return dispatch({
                    type: PANEL_DATE_TIME_ACTION_TYPES.SELECT_HOUR,
                    payload: { value: intent.value }
                });
            case 'selectMinute':
                return dispatch({
                    type: PANEL_DATE_TIME_ACTION_TYPES.SELECT_MINUTE,
                    payload: { value: intent.value }
                });
            case 'shiftMonth':
                return dispatch({
                    type: PANEL_DATE_TIME_ACTION_TYPES.SHIFT_MONTH,
                    payload: { delta: intent.delta }
                });
            default:
                return null;
        }
    };

    return {
        cancel,
        close: cancel,
        confirm,
        dispatch,
        getState: store.getState,
        getViewModel,
        handleIntent,
        isOpen: () => store.getState().open === true,
        open,
        resetNow,
        subscribe(listener, { emit = true } = {}) {
            if (typeof listener !== 'function' || destroyed) return noop;
            listeners.add(listener);
            if (emit) listener(getViewModel(), { type: 'panelDateTime/initial' });
            return () => listeners.delete(listener);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            unsubscribeStore();
            listeners.clear();
        }
    };
};

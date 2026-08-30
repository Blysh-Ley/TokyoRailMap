import {
    normalizePanelCalendarMonth,
    normalizePanelDateKey,
    normalizePanelDateTimeSelection,
    shiftPanelCalendarMonth
} from '../domain/panelDateTime.js';

export const PANEL_DATE_TIME_ACTION_TYPES = Object.freeze({
    OPEN: 'panelDateTime/open',
    SELECT_DATE: 'panelDateTime/selectDate',
    SELECT_HOUR: 'panelDateTime/selectHour',
    SELECT_MINUTE: 'panelDateTime/selectMinute',
    SHIFT_MONTH: 'panelDateTime/shiftMonth',
    CANCEL: 'panelDateTime/cancel',
    CONFIRM: 'panelDateTime/confirm',
    RESET_NOW: 'panelDateTime/resetNow'
});

const withTimePart = (selection, key, value) => {
    const number = Number(value);
    const max = key === 'hour' ? 23 : 59;
    if (!Number.isInteger(number) || number < 0 || number > max) return selection;
    const hour = key === 'hour' ? number : selection.hour;
    const minute = key === 'minute' ? number : selection.minute;
    return {
        ...selection,
        hour,
        minute,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        autoNow: false
    };
};

export const createPanelDateTimeInitialState = (selection = {}) => {
    const committed = normalizePanelDateTimeSelection(selection);
    return {
        open: false,
        committed,
        draft: { ...committed },
        calendarMonth: normalizePanelCalendarMonth({}, committed.dateKey)
    };
};

export const reducePanelDateTimeState = (state, action = {}) => {
    const current = state || createPanelDateTimeInitialState();
    switch (action.type) {
        case PANEL_DATE_TIME_ACTION_TYPES.OPEN: {
            const committed = normalizePanelDateTimeSelection(action.payload, current.committed);
            return {
                open: true,
                committed,
                draft: { ...committed },
                calendarMonth: normalizePanelCalendarMonth({}, committed.dateKey)
            };
        }
        case PANEL_DATE_TIME_ACTION_TYPES.SELECT_DATE: {
            const dateKey = normalizePanelDateKey(action.payload?.dateKey);
            if (!dateKey) return current;
            return {
                ...current,
                draft: { ...current.draft, dateKey, autoNow: false }
            };
        }
        case PANEL_DATE_TIME_ACTION_TYPES.SELECT_HOUR:
            return { ...current, draft: withTimePart(current.draft, 'hour', action.payload?.value) };
        case PANEL_DATE_TIME_ACTION_TYPES.SELECT_MINUTE:
            return { ...current, draft: withTimePart(current.draft, 'minute', action.payload?.value) };
        case PANEL_DATE_TIME_ACTION_TYPES.SHIFT_MONTH:
            return {
                ...current,
                calendarMonth: shiftPanelCalendarMonth(current.calendarMonth, action.payload?.delta)
            };
        case PANEL_DATE_TIME_ACTION_TYPES.CANCEL:
            return {
                ...current,
                open: false,
                draft: { ...current.committed },
                calendarMonth: normalizePanelCalendarMonth({}, current.committed.dateKey)
            };
        case PANEL_DATE_TIME_ACTION_TYPES.CONFIRM: {
            const committed = normalizePanelDateTimeSelection(current.draft, current.committed);
            return { ...current, open: false, committed, draft: { ...committed } };
        }
        case PANEL_DATE_TIME_ACTION_TYPES.RESET_NOW: {
            const committed = normalizePanelDateTimeSelection(action.payload, current.committed);
            return {
                open: false,
                committed: { ...committed, autoNow: true },
                draft: { ...committed, autoNow: true },
                calendarMonth: normalizePanelCalendarMonth({}, committed.dateKey)
            };
        }
        default:
            return current;
    }
};

export const createPanelDateTimeStore = (initialSelection = {}) => {
    let state = createPanelDateTimeInitialState(initialSelection);
    const listeners = new Set();
    return {
        getState: () => state,
        dispatch(action) {
            const nextState = reducePanelDateTimeState(state, action);
            if (nextState !== state) {
                state = nextState;
                listeners.forEach((listener) => listener(state, action));
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

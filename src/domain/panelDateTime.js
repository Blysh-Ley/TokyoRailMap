const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{1,2})$/;
const DAYS_PER_CALENDAR_VIEW = 42;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
};

export const formatPanelDateKey = ({ year, month, day } = {}) => {
    const y = toInteger(year);
    const m = toInteger(month);
    const d = toInteger(day);
    if (y == null || m == null || d == null) return '';
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

export const parsePanelDateKey = (value) => {
    const match = String(value ?? '').trim().match(DATE_KEY_PATTERN);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year
        || candidate.getUTCMonth() + 1 !== month
        || candidate.getUTCDate() !== day
    ) return null;

    return { year, month, day };
};

export const normalizePanelDateKey = (value, fallback = '') => (
    parsePanelDateKey(value) ? String(value).trim() : (parsePanelDateKey(fallback) ? String(fallback).trim() : '')
);

export const normalizePanelTime = (value, fallback = '') => {
    const match = String(value ?? '').trim().match(TIME_PATTERN);
    if (match) {
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }
    }
    return fallback && fallback !== value ? normalizePanelTime(fallback) : '';
};

export const parsePanelTime = (value) => {
    const normalized = normalizePanelTime(value);
    if (!normalized) return null;
    const [hour, minute] = normalized.split(':').map(Number);
    return { hour, minute };
};

export const normalizePanelDateTimeSelection = (selection = {}, fallback = {}) => {
    const fallbackTime = normalizePanelTime(fallback.time);
    const dateKey = normalizePanelDateKey(selection.dateKey, fallback.dateKey);
    const time = normalizePanelTime(selection.time, fallbackTime);
    const parsedTime = parsePanelTime(time) || { hour: 0, minute: 0 };
    return {
        dateKey,
        time: time || '00:00',
        hour: parsedTime.hour,
        minute: parsedTime.minute,
        autoNow: selection.autoNow === true
    };
};

export const normalizePanelCalendarMonth = (value = {}, fallbackDateKey = '') => {
    const fallback = parsePanelDateKey(fallbackDateKey);
    const year = toInteger(value.year) ?? fallback?.year ?? 1970;
    const month = toInteger(value.month) ?? fallback?.month ?? 1;
    const normalized = new Date(Date.UTC(year, month - 1, 1));
    return {
        year: normalized.getUTCFullYear(),
        month: normalized.getUTCMonth() + 1
    };
};

export const shiftPanelCalendarMonth = (value = {}, delta = 0) => {
    const current = normalizePanelCalendarMonth(value);
    const amount = toInteger(delta) ?? 0;
    const shifted = new Date(Date.UTC(current.year, current.month - 1 + amount, 1));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1
    };
};

export const buildPanelCalendarCells = ({
    calendarMonth,
    selectedDateKey = '',
    todayDateKey = ''
} = {}) => {
    const visible = normalizePanelCalendarMonth(calendarMonth, selectedDateKey);
    const firstDayMs = Date.UTC(visible.year, visible.month - 1, 1);
    const firstWeekday = new Date(firstDayMs).getUTCDay();
    const viewStartMs = firstDayMs - (firstWeekday * MS_PER_DAY);

    return Array.from({ length: DAYS_PER_CALENDAR_VIEW }, (_, index) => {
        const date = new Date(viewStartMs + (index * MS_PER_DAY));
        const dateKey = formatPanelDateKey({
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate()
        });
        return {
            dateKey,
            day: date.getUTCDate(),
            inCurrentMonth: date.getUTCFullYear() === visible.year && date.getUTCMonth() + 1 === visible.month,
            selected: dateKey === selectedDateKey,
            today: dateKey === todayDateKey
        };
    });
};

export const buildPanelDateTimeViewModel = (state = {}, {
    resolveServiceDayLabel = () => '',
    todayDateKey = ''
} = {}) => {
    const draft = normalizePanelDateTimeSelection(state.draft, state.committed);
    const calendarMonth = normalizePanelCalendarMonth(state.calendarMonth, draft.dateKey);
    const calendarCells = buildPanelCalendarCells({
        calendarMonth,
        selectedDateKey: draft.dateKey,
        todayDateKey
    }).map((cell) => ({
        ...cell,
        serviceDayLabel: resolveServiceDayLabel(cell.dateKey)
    }));

    return {
        open: state.open === true,
        monthLabel: `${calendarMonth.year}年${calendarMonth.month}月`,
        calendarMonth,
        calendarCells,
        selectedDateKey: draft.dateKey,
        selectedHour: draft.hour,
        selectedMinute: draft.minute,
        selectedServiceDayLabel: resolveServiceDayLabel(draft.dateKey),
        hourOptions: Array.from({ length: 24 }, (_, value) => value),
        minuteOptions: Array.from({ length: 60 }, (_, value) => value)
    };
};

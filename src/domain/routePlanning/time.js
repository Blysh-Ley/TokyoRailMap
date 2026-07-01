export const SERVICE_DAY_BOUNDARY_HOUR = 3;
export const TIMEZONE_MODE_LOCAL = 'local';
export const TIMEZONE_MODE_JAPAN = 'japan';
export const TIMEZONE_STORAGE_KEY = 'tokyorail.timezone.mode';
export const JAPAN_TIME_ZONE = 'Asia/Tokyo';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

const toText = (value) => String(value ?? '').trim();

export const normalizeTimezoneMode = (mode) => (
    toText(mode).toLowerCase() === TIMEZONE_MODE_JAPAN ? TIMEZONE_MODE_JAPAN : TIMEZONE_MODE_LOCAL
);

export const readBusinessTimezoneMode = () => {
    try {
        return normalizeTimezoneMode(globalThis?.localStorage?.getItem?.(TIMEZONE_STORAGE_KEY));
    } catch {
        return TIMEZONE_MODE_LOCAL;
    }
};

const toTimeMs = (value = Date.now()) => {
    if (value instanceof Date) return value.getTime();
    const n = Number(value);
    return Number.isFinite(n) ? n : Date.now();
};

const getTimeZoneFormatter = (() => {
    const cache = new Map();
    return (timeZone) => {
        const key = toText(timeZone) || 'local';
        if (!cache.has(key)) {
            cache.set(key, new Intl.DateTimeFormat('en-US', {
                timeZone: key,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }));
        }
        return cache.get(key);
    };
})();

const partsFromFormatter = (formatter, ms) => {
    const out = {};
    for (const part of formatter.formatToParts(new Date(ms))) {
        if (part.type !== 'literal') out[part.type] = part.value;
    }
    let hour = Number(out.hour);
    if (hour === 24) hour = 0;
    const year = Number(out.year);
    const month = Number(out.month);
    const day = Number(out.day);
    const minute = Number(out.minute);
    const second = Number(out.second);
    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    };
};

export const getBusinessDateParts = (
    dateLike = Date.now(),
    { timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    const ms = toTimeMs(dateLike);
    const mode = normalizeTimezoneMode(timezoneMode);
    if (mode === TIMEZONE_MODE_JAPAN) {
        return partsFromFormatter(getTimeZoneFormatter(JAPAN_TIME_ZONE), ms);
    }
    const d = new Date(ms);
    return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hour: d.getHours(),
        minute: d.getMinutes(),
        second: d.getSeconds(),
        dayOfWeek: d.getDay()
    };
};

const getJapanDateParts = (dateLike = Date.now()) => (
    partsFromFormatter(getTimeZoneFormatter(JAPAN_TIME_ZONE), toTimeMs(dateLike))
);

const getJapanWallTimeMs = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => (
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), Number(second), 0)
);

const addDaysToDateParts = ({ year, month, day }, days) => {
    const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + Number(days || 0)));
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate()
    };
};

export const getJapanServiceDayStartMs = (now = Date.now()) => {
    const ms = toTimeMs(now);
    const parts = getJapanDateParts(ms);
    let start = getJapanWallTimeMs({
        ...parts,
        hour: SERVICE_DAY_BOUNDARY_HOUR,
        minute: 0,
        second: 0
    });
    if (ms < start) {
        start = getJapanWallTimeMs({
            ...addDaysToDateParts(parts, -1),
            hour: SERVICE_DAY_BOUNDARY_HOUR,
            minute: 0,
            second: 0
        });
    }
    return start;
};

export const getServiceDayStartMs = (now = new Date()) => {
    return getJapanServiceDayStartMs(now);
};

export const getNextServiceDayStartMs = (departureMs = Date.now()) => {
    const baseMs = Number.isFinite(Number(departureMs)) ? Number(departureMs) : Date.now();
    return getServiceDayStartMs(baseMs) + MS_PER_DAY;
};

export const getNextCalendarDayServiceStartMs = (departureMs = Date.now()) => {
    const baseMs = Number.isFinite(Number(departureMs)) ? Number(departureMs) : Date.now();
    const next = addDaysToDateParts(getJapanDateParts(baseMs), 1);
    return getJapanWallTimeMs({
        ...next,
        hour: SERVICE_DAY_BOUNDARY_HOUR,
        minute: 0,
        second: 0
    });
};

export const getDisplayServiceDayStartMs = (
    now = Date.now(),
    { timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    const ms = toTimeMs(now);
    const mode = normalizeTimezoneMode(timezoneMode);
    if (mode === TIMEZONE_MODE_JAPAN) return getJapanServiceDayStartMs(ms);

    const d = new Date(ms);
    const candidate = new Date(d.getTime());
    candidate.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    if (d.getTime() < candidate.getTime()) candidate.setDate(candidate.getDate() - 1);
    return candidate.getTime();
};

export const inferServiceDayFromDate = (
    dateLike = new Date(),
    { isHoliday, timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    const ms = toTimeMs(dateLike);
    if (!Number.isFinite(ms)) return 'Weekday';

    const parts = getBusinessDateParts(ms, { timezoneMode });
    const holidayDate = new Date(parts.year, parts.month - 1, parts.day);

    const isWeekend = parts.dayOfWeek === 0 || parts.dayOfWeek === 6;
    const holiday = typeof isHoliday === 'function' ? isHoliday(holidayDate) : false;
    const month = parts.month;
    const day = parts.day;
    const isNewYearHoliday = (month === 12 && day >= 30) || (month === 1 && day <= 3);
    return (isWeekend || holiday || isNewYearHoliday) ? 'SaturdayHoliday' : 'Weekday';
};

export const createNextDayFallbackPlanningBase = ({ departureMs = Date.now(), isHoliday } = {}) => {
    const nextDepartureMs = getNextCalendarDayServiceStartMs(departureMs);
    return {
        departureMs: nextDepartureMs,
        serviceDay: inferServiceDayFromDate(nextDepartureMs, { isHoliday, timezoneMode: TIMEZONE_MODE_JAPAN })
    };
};

export const normalizeHHMM = (value) => {
    const s = toText(value);
    const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return '';
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const hhmmToOffsetMinutes = (hhmm) => {
    const s = normalizeHHMM(hhmm);
    if (!s) return null;
    const [h, m] = s.split(':').map((x) => Number(x));
    let offset = h * 60 + m - SERVICE_DAY_BOUNDARY_HOUR * 60;
    if (offset < 0) offset += 24 * 60;
    return offset;
};

export const parseHHMMToServiceDayMs = (hhmm, serviceDayStartMs) => {
    const offsetMinutes = hhmmToOffsetMinutes(hhmm);
    const base = Number(serviceDayStartMs);
    if (!Number.isFinite(offsetMinutes) || !Number.isFinite(base)) return null;
    return {
        ms: base + offsetMinutes * MS_PER_MINUTE,
        isNextDaySegment: offsetMinutes >= (24 - SERVICE_DAY_BOUNDARY_HOUR) * 60
    };
};

export const parseDisplayHHMMToMs = (
    hhmm,
    { referenceMs = Date.now(), timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    const serviceDayStartMs = getDisplayServiceDayStartMs(referenceMs, { timezoneMode });
    const parsed = parseHHMMToServiceDayMs(hhmm, serviceDayStartMs);
    return parsed ? { ...parsed, serviceDayStartMs } : null;
};

export const toHHMM = (timeMs) => {
    if (!Number.isFinite(timeMs)) return '--:--';
    const parts = getBusinessDateParts(timeMs);
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
};

export const toHHMMForTimezone = (
    timeMs,
    { timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    if (!Number.isFinite(timeMs)) return '--:--';
    const parts = getBusinessDateParts(timeMs, { timezoneMode });
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
};

export const formatBusinessDateInputValue = (
    dateLike = Date.now(),
    { timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    const parts = getBusinessDateParts(dateLike, { timezoneMode });
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

export const formatBusinessDateLabel = (
    dateLike = Date.now(),
    { isHoliday, timezoneMode = readBusinessTimezoneMode() } = {}
) => {
    const parts = getBusinessDateParts(dateLike, { timezoneMode });
    const dayType = inferServiceDayFromDate(dateLike, { isHoliday, timezoneMode }) === 'SaturdayHoliday' ? '休息日' : '工作日';
    return `${dayType} ${String(parts.month).padStart(2, '0')}月${String(parts.day).padStart(2, '0')}日`;
};

export const formatDuration = (durationMs) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return '用时--';
    const totalMin = Math.round(durationMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}分钟`;
    return `${h}小时${m}分钟`;
};

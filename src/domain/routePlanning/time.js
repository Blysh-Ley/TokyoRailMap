export const SERVICE_DAY_BOUNDARY_HOUR = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toText = (value) => String(value ?? '').trim();

export const getServiceDayStartMs = (now = new Date()) => {
    const d = new Date(now.getTime());
    const candidate = new Date(d.getTime());
    candidate.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    if (d.getTime() < candidate.getTime()) candidate.setDate(candidate.getDate() - 1);
    return candidate.getTime();
};

export const getNextServiceDayStartMs = (departureMs = Date.now()) => {
    const baseMs = Number.isFinite(Number(departureMs)) ? Number(departureMs) : Date.now();
    return getServiceDayStartMs(new Date(baseMs)) + MS_PER_DAY;
};

export const getNextCalendarDayServiceStartMs = (departureMs = Date.now()) => {
    const baseMs = Number.isFinite(Number(departureMs)) ? Number(departureMs) : Date.now();
    const next = new Date(baseMs);
    next.setDate(next.getDate() + 1);
    next.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    return next.getTime();
};

export const inferServiceDayFromDate = (dateLike = new Date(), { isHoliday } = {}) => {
    const date = dateLike instanceof Date ? new Date(dateLike.getTime()) : new Date(dateLike || Date.now());
    if (!Number.isFinite(date.getTime())) return 'Weekday';

    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = typeof isHoliday === 'function' ? isHoliday(date) : false;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const isNewYearHoliday = (month === 12 && day >= 30) || (month === 1 && day <= 3);
    return (isWeekend || holiday || isNewYearHoliday) ? 'SaturdayHoliday' : 'Weekday';
};

export const createNextDayFallbackPlanningBase = ({ departureMs = Date.now(), isHoliday } = {}) => {
    const nextDepartureMs = getNextCalendarDayServiceStartMs(departureMs);
    return {
        departureMs: nextDepartureMs,
        serviceDay: inferServiceDayFromDate(new Date(nextDepartureMs), { isHoliday })
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

export const toHHMM = (timeMs) => {
    if (!Number.isFinite(timeMs)) return '--:--';
    const d = new Date(timeMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const formatDuration = (durationMs) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return '用时--';
    const totalMin = Math.round(durationMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}分钟`;
    return `${h}小时${m}分钟`;
};

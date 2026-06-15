const defaultToText = (value) => String(value ?? '').trim();

export const STATION_JUMP_CLASS = 'panel-station-jump-target';
export const STATION_JUMP_SELECTOR = `.${STATION_JUMP_CLASS}[data-station-id]`;

export const appendStationJumpClass = (className = '') => {
    const list = defaultToText(className).split(/\s+/).filter(Boolean);
    if (!list.includes(STATION_JUMP_CLASS)) list.push(STATION_JUMP_CLASS);
    return list.join(' ');
};

export const normalizeStationJumpTime = (value, { toText = defaultToText } = {}) => {
    const source = toText(value);
    const match = source.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '';

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const closestInside = (target, selector, rootEl = null) => {
    if (!target || typeof target.closest !== 'function') return null;
    const hit = target.closest(selector);
    if (!hit) return null;
    if (rootEl && typeof rootEl.contains === 'function' && !rootEl.contains(hit)) return null;
    return hit;
};

const isBlockedBySelector = (target, selector, rootEl = null) => {
    const blocked = closestInside(target, selector, rootEl);
    return Boolean(blocked);
};

export const resolveStationJumpIntent = (target, {
    blockedSelector = '.panel-timetable-row[data-trip-key], .panel-timetable-dest',
    rootEl = null,
    adjustTime = true,
    toText = defaultToText
} = {}) => {
    if (blockedSelector && isBlockedBySelector(target, blockedSelector, rootEl)) return null;

    const stationEl = closestInside(target, STATION_JUMP_SELECTOR, rootEl);
    if (!stationEl) return null;

    const stationId = toText(stationEl.getAttribute?.('data-station-id'));
    if (!stationId) return null;

    const arrivalTime = normalizeStationJumpTime(
        stationEl.getAttribute?.('data-panel-station-arrival-time'),
        { toText }
    );

    return {
        adjustTime: adjustTime !== false && Boolean(arrivalTime),
        arrivalTime,
        stationEl,
        stationId
    };
};

const toText = (value) => String(value ?? '').trim();

const escapeHtml = (input) => {
    const value = String(input ?? '');
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const EMPTY_TIMETABLE_HTML = '<div class="panel-timetable-empty">当前无班次</div>';

const defaultBadgeTextColor = () => '#fff';

const formatTimeWithPlus = (hhmm, isNextDaySegment) => {
    const s = toText(hhmm);
    if (!s) return '';
    return isNextDaySegment ? `${s}` : s;
};

const parseTimetableTimeMinutes = (hhmm) => {
    const match = toText(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
};

const getPanelTimetableDwellMinutes = (row = {}) => {
    const arrMinutes = parseTimetableTimeMinutes(row.arr);
    const depMinutes = parseTimetableTimeMinutes(row.dep);
    if (!Number.isFinite(arrMinutes) || !Number.isFinite(depMinutes)) return 0;

    const arrTotal = arrMinutes + (row.arrPlus ? 1440 : 0);
    let depTotal = depMinutes + (row.depPlus ? 1440 : 0);
    if (depTotal < arrTotal) depTotal += 1440;

    const dwellMinutes = depTotal - arrTotal;
    return Number.isFinite(dwellMinutes) ? Math.max(0, dwellMinutes) : 0;
};

const renderPanelTimetableMomentHtml = (row = {}) => {
    const timeText = row.arr
        ? formatTimeWithPlus(row.arr, row.arrPlus)
        : (row.dep ? formatTimeWithPlus(row.dep, row.depPlus) : '');
    if (!timeText) return '';

    const extras = [];
    if (row.showOriginLabel) {
        extras.push({ className: 'panel-timetable-time-extra is-origin', text: '始发' });
    }
    if (row.showTerminalLabel) {
        extras.push({ className: 'panel-timetable-time-extra is-terminal', text: '终到' });
    }

    const dwellMinutes = getPanelTimetableDwellMinutes(row);
    if (dwellMinutes > 2) {
        extras.push({ className: 'panel-timetable-time-extra is-dwell', text: `+${dwellMinutes}'` });
    }

    return [
        `<span class="panel-timetable-time-main panel-time-arrive">${escapeHtml(timeText)}</span>`,
        ...extras.map((item) => `<span class="${item.className}">${escapeHtml(item.text)}</span>`)
    ].join('');
};

const renderPanelTimetableRowHtml = ({
    row,
    resolveBadgeTextColor,
    forceFutureStyle = false
} = {}) => {
    const item = row || {};
    const isPast = forceFutureStyle ? false : item.isPast === true;
    const rowClass = isPast ? 'panel-timetable-row is-past' : 'panel-timetable-row';
    const tripAttr = item.tripKey ? ` data-trip-key="${escapeHtml(item.realOriginId)}"` : '';
    const rawTypeColor = toText(item.typeColor);
    const badgeBg = isPast ? '#c3c7cd' : (rawTypeColor || '#767676');
    const badgeFg = isPast ? '#eee' : resolveBadgeTextColor(badgeBg);
    const typeStyle = ` style="--panel-type-badge-bg:${escapeHtml(badgeBg)};--panel-type-badge-fg:${escapeHtml(badgeFg)}"`;
    const destText = toText(item.terminalDisplayName || item.destName || item.terminalName);
    const typeName = toText(item.typeName);

    return `
        <div class="${rowClass}"${tripAttr}>
            <div class="panel-timetable-dest">
                <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml(destText)}">
                    <span class="panel-timetable-dest-marquee-inner">${escapeHtml(destText)}</span>
                </span>
            </div>
            <div class="panel-timetable-time">${renderPanelTimetableMomentHtml(item)}</div>
            <div class="panel-timetable-type">
                <span class="panel-timetable-type-marquee"${typeStyle} aria-label="${escapeHtml(typeName)}">
                    <span class="panel-timetable-type-marquee-inner">${escapeHtml(typeName)}</span>
                </span>
            </div>
        </div>
    `;
};

export const renderPanelTimetableListHtml = ({
    rows = [],
    resolveBadgeTextColor = defaultBadgeTextColor
} = {}) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return EMPTY_TIMETABLE_HTML;
    const resolveBadgeTextColorSafe = typeof resolveBadgeTextColor === 'function'
        ? resolveBadgeTextColor
        : defaultBadgeTextColor;

    return items
        .map((row) => renderPanelTimetableRowHtml({
            row,
            resolveBadgeTextColor: resolveBadgeTextColorSafe
        }))
        .join('');
};

export const renderPanelPrintableTimetableListHtml = ({
    rows = [],
    resolveBadgeTextColor = defaultBadgeTextColor
} = {}) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return EMPTY_TIMETABLE_HTML;
    const resolveBadgeTextColorSafe = typeof resolveBadgeTextColor === 'function'
        ? resolveBadgeTextColor
        : defaultBadgeTextColor;

    return items
        .map((row) => renderPanelTimetableRowHtml({
            row: { ...(row || {}), isPast: false },
            resolveBadgeTextColor: resolveBadgeTextColorSafe,
            forceFutureStyle: true
        }))
        .join('');
};

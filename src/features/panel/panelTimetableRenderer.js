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

const renderPanelTimetableRowHtml = ({
    row,
    renderTime,
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
            <div class="panel-timetable-time">${renderTime(item)}</div>
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
    renderTime,
    resolveBadgeTextColor = defaultBadgeTextColor
} = {}) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return EMPTY_TIMETABLE_HTML;
    const renderTimeSafe = typeof renderTime === 'function' ? renderTime : () => '';
    const resolveBadgeTextColorSafe = typeof resolveBadgeTextColor === 'function'
        ? resolveBadgeTextColor
        : defaultBadgeTextColor;

    return items
        .map((row) => renderPanelTimetableRowHtml({
            row,
            renderTime: renderTimeSafe,
            resolveBadgeTextColor: resolveBadgeTextColorSafe
        }))
        .join('');
};

export const renderPanelPrintableTimetableListHtml = ({
    rows = [],
    renderTime,
    resolveBadgeTextColor = defaultBadgeTextColor
} = {}) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return EMPTY_TIMETABLE_HTML;
    const renderTimeSafe = typeof renderTime === 'function' ? renderTime : () => '';
    const resolveBadgeTextColorSafe = typeof resolveBadgeTextColor === 'function'
        ? resolveBadgeTextColor
        : defaultBadgeTextColor;

    return items
        .map((row) => renderPanelTimetableRowHtml({
            row: { ...(row || {}), isPast: false },
            renderTime: renderTimeSafe,
            resolveBadgeTextColor: resolveBadgeTextColorSafe,
            forceFutureStyle: true
        }))
        .join('');
};

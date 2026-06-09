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

const formatTypeBadgeLabel = (typeNameRaw) => {
    const name = toText(typeNameRaw);
    if (!name) return '';
    if (/\s/.test(name)) return name;
    const chars = Array.from(name);
    if (chars.length !== 2) return name;
    return `${chars[0]}      ${chars[1]}`;
};

const shouldUseSmallTypeBadgeFont = (typeNameRaw) => {
    const plain = toText(typeNameRaw).replace(/\s+/g, '');
    if (!plain) return false;
    return Array.from(plain).length > 4;
};

const renderPanelTimetableRowHtml = ({
    row,
    renderTime,
    resolveBadgeTextColor,
    forceFutureStyle = false,
    isNextUp = false
} = {}) => {
    const item = row || {};
    const isPast = forceFutureStyle ? false : item.isPast === true;
    const rowClass = [
        'panel-timetable-row',
        isPast ? 'is-past' : '',
        !isPast && isNextUp ? 'is-next-up' : ''
    ].filter(Boolean).join(' ');
    const tripAttr = item.tripKey ? ` data-trip-key="${escapeHtml(item.realOriginId)}"` : '';
    const rawTypeColor = toText(item.typeColor);
    const badgeBg = isPast ? '#c3c7cd' : (rawTypeColor || '#767676');
    const badgeFg = isPast ? '#eee' : resolveBadgeTextColor(badgeBg);
    const typeStyle = ` style="--panel-type-badge-bg:${escapeHtml(badgeBg)};--panel-type-badge-fg:${escapeHtml(badgeFg)}"`;
    const destText = toText(item.terminalDisplayName || item.destName || item.terminalName);
    const typeName = toText(item.typeName);
    const typeLabel = formatTypeBadgeLabel(typeName);
    const typeSmallClass = shouldUseSmallTypeBadgeFont(typeName) ? ' is-small-text' : '';
    const parseMinutes = (time) => { const m = toText(time).match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
    const arrTotal = parseMinutes(item.arr) + (item.arrPlus ? 1440 : 0);
    let depTotal = parseMinutes(item.dep) + (item.depPlus ? 1440 : 0);
    if (Number.isFinite(arrTotal) && Number.isFinite(depTotal) && depTotal < arrTotal) depTotal += 1440;
    const dwellMinutes = Number.isFinite(arrTotal) && Number.isFinite(depTotal) ? Math.max(0, depTotal - arrTotal) : 0;
    const extraHtml = `${item.showOriginLabel ? '<span class="panel-timetable-time-extra is-origin">始发</span>' : ''}${item.showTerminalLabel ? '<span class="panel-timetable-time-extra is-terminal">终到</span>' : ''}${dwellMinutes > 2 ? `<span class="panel-timetable-time-extra is-dwell">+${dwellMinutes}'</span>` : ''}`;
    const timeClass = `panel-timetable-time${item.arr ? ' has-arrive' : ''}`;

    return `
        <div class="${rowClass}"${tripAttr}>
            <div class="${timeClass}">${renderTime(item)}${extraHtml}</div>
            <div class="panel-timetable-type">
                <span class="panel-timetable-type-marquee${typeSmallClass}"${typeStyle} aria-label="${escapeHtml(typeName)}" title="${escapeHtml(typeName)}">
                    <span class="panel-timetable-type-marquee-inner">${escapeHtml(typeLabel)}</span>
                </span>
            </div>
            <div class="panel-timetable-dest">
                <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml(destText)}">
                    <span class="panel-timetable-dest-marquee-inner">${escapeHtml(destText)}</span>
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
    const nextUpIndex = items.findIndex((row) => row?.isPast !== true);

    return items
        .map((row, index) => renderPanelTimetableRowHtml({
            row,
            renderTime: renderTimeSafe,
            resolveBadgeTextColor: resolveBadgeTextColorSafe,
            isNextUp: index === nextUpIndex
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

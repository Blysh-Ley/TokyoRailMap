

// timetable-table.js
const toText_timetable_table = (v) => String(v ?? '').trim();

const escapeHtml_timetable_table = (input) => {
    const s = String(input ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const createEl_timetable_table = (tag, className, text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = String(text);
    return node;
};

const parseCssColorToRgb_timetable_table = (input) => {
    const s = String(input || '').trim();
    if (!s) return null;

    const hex = s.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        const raw = hex[1];
        if (raw.length === 3 || raw.length === 4) {
            return {
                r: parseInt(raw[0] + raw[0], 16),
                g: parseInt(raw[1] + raw[1], 16),
                b: parseInt(raw[2] + raw[2], 16)
            };
        }
        if (raw.length === 6 || raw.length === 8) {
            return {
                r: parseInt(raw.slice(0, 2), 16),
                g: parseInt(raw.slice(2, 4), 16),
                b: parseInt(raw.slice(4, 6), 16)
            };
        }
    }

    const rgb = s.match(/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i);
    if (!rgb) return null;
    return {
        r: Math.max(0, Math.min(255, Math.round(Number(rgb[1])))),
        g: Math.max(0, Math.min(255, Math.round(Number(rgb[2])))),
        b: Math.max(0, Math.min(255, Math.round(Number(rgb[3]))))
    };
};

const relativeLuminance_timetable_table = ({ r, g, b }) => {
    const toLinear = (v) => {
        const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
        return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const getBadgeTextColor_timetable_table = (bgColor) => {
    const parsed = parseCssColorToRgb_timetable_table(bgColor);
    if (!parsed) return '#fff';
    return relativeLuminance_timetable_table(parsed) > 0.55 ? '#111' : '#fff';
};

export const buildTimetableStationText = ({ stationCode = '', stationName = '', stationId = '' } = {}) => {
    const name = toText_timetable_table(stationName || stationId);
    const code = toText_timetable_table(stationCode);
    return code ? `${code} ${name}` : name;
};

export const renderTimetableNoteRowHtml = ({
    rowClass = '',
    rowStyle = '',
    dotClass = '',
    lineClass = '',
    typeClass = '',
    lineText = '',
    lineColor = '',
    dotColor = '',
    typeText = '',
    typeColor = '',
    lineOriginalColor = '',
    dotOriginalColor = '',
    typeOriginalColor = ''
} = {}) => {
    const safeRowClass = toText_timetable_table(rowClass);
    const safeRowStyle = toText_timetable_table(rowStyle);
    const safeDotClass = toText_timetable_table(dotClass);
    const safeLineClass = toText_timetable_table(lineClass);
    const safeTypeClass = toText_timetable_table(typeClass);
    const safeLineText = toText_timetable_table(lineText);
    const safeLineColor = toText_timetable_table(lineColor);
    const safeDotColor = toText_timetable_table(dotColor);
    const safeTypeText = toText_timetable_table(typeText);
    const safeTypeColor = toText_timetable_table(typeColor);
    const safeLineOriginalColor = toText_timetable_table(lineOriginalColor);
    const safeDotOriginalColor = toText_timetable_table(dotOriginalColor);
    const safeTypeOriginalColor = toText_timetable_table(typeOriginalColor);

    if (!safeRowClass || !safeLineClass || !safeLineText) return '';

    const dotHtml = safeDotClass
        ? `<span class="${escapeHtml_timetable_table(safeDotClass)}"${safeDotColor ? ` style="background:${escapeHtml_timetable_table(safeDotColor)}"` : ''}${safeDotOriginalColor ? ` data-panel-export-original-background="${escapeHtml_timetable_table(safeDotOriginalColor)}"` : ''}></span>`
        : '';
    const lineHtml = `<span class="${escapeHtml_timetable_table(safeLineClass)}"${safeLineColor ? ` style="color:${escapeHtml_timetable_table(safeLineColor)}"` : ''}${safeLineOriginalColor ? ` data-panel-export-original-color="${escapeHtml_timetable_table(safeLineOriginalColor)}"` : ''}>${escapeHtml_timetable_table(safeLineText)}</span>`;
    const typeHtml = (safeTypeClass && safeTypeText)
        ? `<span class="${escapeHtml_timetable_table(safeTypeClass)}"${safeTypeColor ? ` style="background:${escapeHtml_timetable_table(safeTypeColor)};color:${escapeHtml_timetable_table(getBadgeTextColor_timetable_table(safeTypeColor))}"` : ''}${safeTypeOriginalColor ? ` data-panel-export-original-background="${escapeHtml_timetable_table(safeTypeOriginalColor)}"` : ''}>${escapeHtml_timetable_table(safeTypeText)}</span>`
        : '';

    return `<div class="${escapeHtml_timetable_table(safeRowClass)}"${safeRowStyle ? ` style="${escapeHtml_timetable_table(safeRowStyle)}"` : ''}>${dotHtml}${lineHtml}${typeHtml}</div>`;
};

export const renderTimetablePlainNoteRowHtml = ({
    rowClass = '',
    lineClass = '',
    text = ''
} = {}) => {
    const safeRowClass = toText_timetable_table(rowClass);
    const safeLineClass = toText_timetable_table(lineClass);
    const safeText = toText_timetable_table(text);
    if (!safeRowClass || !safeLineClass || !safeText) return '';
    return `<div class="${escapeHtml_timetable_table(safeRowClass)}"><span class="${escapeHtml_timetable_table(safeLineClass)}">${escapeHtml_timetable_table(safeText)}</span></div>`;
};

export const renderTimetableStationRowHtml = ({
    rowClass = '',
    stationClass = '',
    arriveCellClass = '',
    departCellClass = '',
    arriveTextClass = '',
    departTextClass = '',
    stationId = '',
    stationText = '',
    lineColor = '',
    arrivalLabelHtml = '',
    departLabelHtml = '',
    arrivalText = '',
    departureText = ''
} = {}) => {
    const safeRowClass = toText_timetable_table(rowClass);
    const safeStationClass = toText_timetable_table(stationClass);
    const safeArriveCellClass = toText_timetable_table(arriveCellClass);
    const safeDepartCellClass = toText_timetable_table(departCellClass);
    const safeArriveTextClass = toText_timetable_table(arriveTextClass);
    const safeDepartTextClass = toText_timetable_table(departTextClass);
    const safeStationId = toText_timetable_table(stationId);
    const safeStationText = toText_timetable_table(stationText);
    const safeLineColor = toText_timetable_table(lineColor);
    const safeArrivalText = toText_timetable_table(arrivalText);
    const safeDepartureText = toText_timetable_table(departureText);

    if (!safeRowClass || !safeStationClass || !safeArriveCellClass || !safeDepartCellClass) return '';

    const stationAttrs = [
        `class="${escapeHtml_timetable_table(safeStationClass)}"`,
        safeStationId ? `data-station-id="${escapeHtml_timetable_table(safeStationId)}"` : '',
        safeLineColor ? `data-line-color="${escapeHtml_timetable_table(safeLineColor)}"` : ''
    ].filter(Boolean).join(' ');

    const arriveHtml = safeArrivalText && safeArriveTextClass
        ? `<span class="${escapeHtml_timetable_table(safeArriveTextClass)}">${escapeHtml_timetable_table(safeArrivalText)}</span>`
        : '';
    const departHtml = safeDepartureText && safeDepartTextClass
        ? `<span class="${escapeHtml_timetable_table(safeDepartTextClass)}">${escapeHtml_timetable_table(safeDepartureText)}</span>`
        : '';

    return `
        <div class="${escapeHtml_timetable_table(safeRowClass)}">
            <div ${stationAttrs}>${escapeHtml_timetable_table(safeStationText)}</div>
            <div class="${escapeHtml_timetable_table(safeArriveCellClass)}">${arrivalLabelHtml || ''}${arriveHtml}</div>
            <div class="${escapeHtml_timetable_table(safeDepartCellClass)}">${departLabelHtml || ''}${departHtml}</div>
        </div>
    `;
};

export const createTimetableNoteRow = ({
    rowClass = '',
    dotClass = '',
    lineClass = '',
    typeClass = '',
    directionClass = '',
    lineText = '',
    lineColor = '',
    dotColor = '',
    typeText = '',
    typeColor = '',
    directionText = ''
} = {}) => {
    const row = createEl_timetable_table('div', rowClass);
    const dot = dotClass ? createEl_timetable_table('span', dotClass) : null;
    if (dot && dotColor) dot.style.background = String(dotColor);
    if (dot) row.appendChild(dot);

    const line = createEl_timetable_table('span', lineClass, lineText);
    if (lineColor) line.style.color = String(lineColor);
    row.appendChild(line);

    if (directionClass && toText_timetable_table(directionText)) {
        row.appendChild(createEl_timetable_table('span', directionClass, directionText));
    }

    if (typeClass && toText_timetable_table(typeText)) {
        const type = createEl_timetable_table('span', typeClass, typeText);
        if (typeColor) {
            const bg = String(typeColor);
            type.style.background = bg;
            type.style.color = getBadgeTextColor_timetable_table(bg);
        }
        row.appendChild(type);
    }

    return row;
};

export const createTimetableStationRow = ({
    rowClass = '',
    stationClass = '',
    arriveCellClass = '',
    departCellClass = '',
    arriveTextClass = '',
    departTextClass = '',
    destinationTextClass = '',
    stationId = '',
    stationText = '',
    arrivalText = '',
    departureText = '',
    showDestination = false,
    destinationText = ''
} = {}) => {
    const row = createEl_timetable_table('div', rowClass);
    const station = createEl_timetable_table('div', stationClass, stationText);
    if (toText_timetable_table(stationId)) station.setAttribute('data-station-id', toText_timetable_table(stationId));
    row.appendChild(station);

    const arrive = createEl_timetable_table('div', arriveCellClass);
    if (toText_timetable_table(arrivalText) && arriveTextClass) {
        arrive.appendChild(createEl_timetable_table('span', arriveTextClass, arrivalText));
    }
    row.appendChild(arrive);

    const depart = createEl_timetable_table('div', departCellClass);
    if (showDestination && destinationTextClass && toText_timetable_table(destinationText)) {
        depart.appendChild(createEl_timetable_table('span', destinationTextClass, destinationText));
    } else if (toText_timetable_table(departureText) && departTextClass) {
        depart.appendChild(createEl_timetable_table('span', departTextClass, departureText));
    }
    row.appendChild(depart);

    return row;
};

// panelTimetableHourWindow.js
export const toPanelServiceHourIndex = (timeMs, serviceDayStartMs) => {
    const ms = Number(timeMs);
    const base = Number(serviceDayStartMs);
    if (!Number.isFinite(ms) || !Number.isFinite(base)) return null;
    return Math.floor((ms - base) / 3600000);
};

export const formatPanelServiceHourLabel = (serviceHourIndex, {
    serviceDayBoundaryHour = 3
} = {}) => {
    const index = Number(serviceHourIndex);
    if (!Number.isFinite(index)) return '';
    const hour = (Number(serviceDayBoundaryHour) + index) % 24;
    return String((hour + 24) % 24).padStart(2, '0');
};

export const choosePanelHourWindow = ({
    minHour,
    maxHour,
    currentHour,
    expanded,
    expandedWindowSize = 10
} = {}) => {
    if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) return [];
    if (maxHour < minHour) return [];

    if (!expanded) {
        let start = Number.isFinite(currentHour) ? currentHour : minHour;
        if (start < minHour) start = minHour;
        if (start > maxHour) start = maxHour;
        const out = [];
        for (let hour = start; hour <= maxHour; hour += 1) out.push(hour);
        return out;
    }

    const size = Number.isFinite(expandedWindowSize) && expandedWindowSize > 0
        ? Math.floor(expandedWindowSize)
        : 10;
    let start = currentHour - 1;
    if (!Number.isFinite(start)) start = minHour;

    if (start < minHour) start = minHour;
    if (start > maxHour) start = Math.max(minHour, maxHour - size + 1);

    let end = Math.min(maxHour, start + size - 1);
    if ((end - start + 1) < size) start = Math.max(minHour, end - size + 1);

    const out = [];
    for (let hour = start; hour <= end; hour += 1) out.push(hour);
    return out;
};

// panelTimetableRenderer.js
const toText_panelTimetableRenderer = (value) => String(value ?? '').trim();

const escapeHtml_panelTimetableRenderer = (input) => {
    const value = String(input ?? '');
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const EMPTY_TIMETABLE_HTML_panelTimetableRenderer = '<div class="panel-timetable-empty">当前无班次</div>';

const defaultBadgeTextColor_panelTimetableRenderer = () => '#fff';

const formatTypeBadgeLabel_panelTimetableRenderer = (typeNameRaw) => {
    const name = toText_panelTimetableRenderer(typeNameRaw);
    if (!name) return '';
    if (/\s/.test(name)) return name;
    const chars = Array.from(name);
    if (chars.length !== 2) return name;
    return `${chars[0]}      ${chars[1]}`;
};

const shouldUseSmallTypeBadgeFont_panelTimetableRenderer = (typeNameRaw) => {
    const plain = toText_panelTimetableRenderer(typeNameRaw).replace(/\s+/g, '');
    if (!plain) return false;
    return Array.from(plain).length > 4;
};

const isBaseStopTypeName_panelTimetableRenderer = (typeNameRaw) => {
    const typeName = toText_panelTimetableRenderer(typeNameRaw);
    return typeName === '普通' || typeName === '各站停车';
};

const renderPanelTimetableRowHtml_panelTimetableRenderer = ({
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
    const tripKey = resolvePanelTimetableTripKey(item, { toText_panelTimetableRenderer });
    const tripAttr = tripKey ? ` data-trip-key="${escapeHtml_panelTimetableRenderer(tripKey)}"` : '';
    const rawTypeColor = toText_panelTimetableRenderer(item.typeColor);
    const badgeBg = isPast ? '#c3c7cd' : (rawTypeColor || '#767676');
    const badgeFg = isPast ? '#eee' : resolveBadgeTextColor(badgeBg);
    const typeStyle = ` style="--panel-type-badge-bg:${escapeHtml_panelTimetableRenderer(badgeBg)};--panel-type-badge-fg:${escapeHtml_panelTimetableRenderer(badgeFg)}"`;
    const destText = toText_panelTimetableRenderer(item.terminalDisplayName || item.destName || item.terminalName);
    const typeName = toText_panelTimetableRenderer(item.typeName);
    const typeLabel = formatTypeBadgeLabel_panelTimetableRenderer(typeName);
    const typeClasses = [
        'panel-timetable-type-marquee',
        isBaseStopTypeName_panelTimetableRenderer(typeName) ? 'panel-station-info-type is-stop is-base-stop' : '',
        shouldUseSmallTypeBadgeFont_panelTimetableRenderer(typeName) ? 'is-small-text' : ''
    ].filter(Boolean).join(' ');
    const parseMinutes = (time) => { const m = toText_panelTimetableRenderer(time).match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
    const arrTotal = parseMinutes(item.arr) + (item.arrPlus ? 1440 : 0);
    let depTotal = parseMinutes(item.dep) + (item.depPlus ? 1440 : 0);
    if (Number.isFinite(arrTotal) && Number.isFinite(depTotal) && depTotal < arrTotal) depTotal += 1440;
    const dwellMinutes = Number.isFinite(arrTotal) && Number.isFinite(depTotal) ? Math.max(0, depTotal - arrTotal) : 0;
    const extraHtml = `${item.showOriginLabel ? '<span class="panel-timetable-time-extra is-origin">始发</span>' : ''}${item.showTerminalLabel ? '<span class="panel-timetable-time-extra is-terminal">终到</span>' : ''}${dwellMinutes > 2 ? `<span class="panel-timetable-time-extra is-dwell">+${dwellMinutes}'</span>` : ''}`;
    const timeClass_panelTimetableRenderer = `panel-timetable-time${item.arr ? ' has-arrive' : ''}`;

    return `
        <div class="${rowClass}"${tripAttr}>
            <div class="${timeClass_panelTimetableRenderer}">${renderTime(item)}${extraHtml}</div>
            <div class="panel-timetable-type">
                <span class="${typeClasses}"${typeStyle} aria-label="${escapeHtml_panelTimetableRenderer(typeName)}" title="${escapeHtml_panelTimetableRenderer(typeName)}">
                    <span class="panel-timetable-type-marquee-inner">${escapeHtml_panelTimetableRenderer(typeLabel)}</span>
                </span>
            </div>
            <div class="panel-timetable-dest">
                <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml_panelTimetableRenderer(destText)}">
                    <span class="panel-timetable-dest-marquee-inner">${escapeHtml_panelTimetableRenderer(destText)}</span>
                </span>
            </div>
        </div>
    `;
};

export const renderPanelTimetableListHtml = ({
    rows = [],
    renderTime,
    resolveBadgeTextColor = defaultBadgeTextColor_panelTimetableRenderer
} = {}) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return EMPTY_TIMETABLE_HTML_panelTimetableRenderer;
    const renderTimeSafe = typeof renderTime === 'function' ? renderTime : () => '';
    const resolveBadgeTextColorSafe = typeof resolveBadgeTextColor === 'function'
        ? resolveBadgeTextColor
        : defaultBadgeTextColor_panelTimetableRenderer;
    const nextUpIndex = items.findIndex((row) => row?.isPast !== true);

    return items
        .map((row, index) => renderPanelTimetableRowHtml_panelTimetableRenderer({
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
    resolveBadgeTextColor = defaultBadgeTextColor_panelTimetableRenderer
} = {}) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return EMPTY_TIMETABLE_HTML_panelTimetableRenderer;
    const renderTimeSafe = typeof renderTime === 'function' ? renderTime : () => '';
    const resolveBadgeTextColorSafe = typeof resolveBadgeTextColor === 'function'
        ? resolveBadgeTextColor
        : defaultBadgeTextColor_panelTimetableRenderer;

    return items
        .map((row) => renderPanelTimetableRowHtml_panelTimetableRenderer({
            row: { ...(row || {}), isPast: false },
            renderTime: renderTimeSafe,
            resolveBadgeTextColor: resolveBadgeTextColorSafe,
            forceFutureStyle: true
        }))
        .join('');
};

// panelTimetableTripKey.js
const defaultToText_panelTimetableTripKey = (value) => String(value ?? '').trim();

export const resolvePanelTimetableTripKey = (row, {
    toText = defaultToText_panelTimetableTripKey
} = {}) => {
    const item = row || {};
    return toText(item.realOriginId) || toText(item.tripKey) || toText(item.id);
};

// panelTimetableViewModel.js
const defaultToText_panelTimetableViewModel = (value) => String(value ?? '').trim();

export const normalizeTimetableAllowedTripKeys = (allowedTripKeySet, {
    toText = defaultToText_panelTimetableViewModel
} = {}) => {
    if (allowedTripKeySet instanceof Set) return allowedTripKeySet;
    if (!Array.isArray(allowedTripKeySet)) return null;
    const out = new Set(allowedTripKeySet.map((x) => toText(x)).filter(Boolean));
    return out.size ? out : null;
};

export const normalizeTimetableSourceLineIds = ({
    lineId,
    sourceLineIds,
    toText = defaultToText_panelTimetableViewModel
} = {}) => Array.from(new Set(
    (Array.isArray(sourceLineIds) ? sourceLineIds : [lineId])
        .map((x) => toText(x))
        .filter(Boolean)
));

const rowPickScore_panelTimetableViewModel = (row, {
    toText = defaultToText_panelTimetableViewModel
} = {}) => {
    let score = 0;
    if (toText(row?.dep)) score += 10;
    if (toText(row?.typeName)) score += 5;
    if (toText(row?.typeColor)) score += 2;
    if (toText(row?.terminalName) || toText(row?.destName)) score += 1;
    return score;
};

const mergeRowMetadata_panelTimetableViewModel = (primary, secondary, {
    toText = defaultToText_panelTimetableViewModel
} = {}) => {
    const out = { ...(primary || {}) };
    const other = secondary || {};

    if (!toText(out.arr) && toText(other.arr)) {
        out.arr = other.arr;
        out.arrPlus = !!other.arrPlus;
    }
    if (!toText(out.dep) && toText(other.dep)) {
        out.dep = other.dep;
        out.depPlus = !!other.depPlus;
    }

    out.showOriginLabel = !!(out.showOriginLabel || other.showOriginLabel);
    out.showTerminalLabel = !!(out.showTerminalLabel || other.showTerminalLabel);

    if (!toText(out.typeName) && toText(other.typeName)) out.typeName = other.typeName;
    if (!toText(out.typeColor) && toText(other.typeColor)) out.typeColor = other.typeColor;
    if (!toText(out.originId) && toText(other.originId)) out.originId = other.originId;
    if (!toText(out.originName) && toText(other.originName)) out.originName = other.originName;
    if (!toText(out.terminalId) && toText(other.terminalId)) out.terminalId = other.terminalId;
    if (!toText(out.terminalName) && toText(other.terminalName)) out.terminalName = other.terminalName;
    if (!toText(out.terminalDisplayName) && toText(other.terminalDisplayName)) out.terminalDisplayName = other.terminalDisplayName;
    if (!Array.isArray(out.terminalNames) || !out.terminalNames.length) {
        out.terminalNames = Array.isArray(other.terminalNames) ? other.terminalNames.slice() : [];
    }
    if (!Array.isArray(out.terminalIds) || !out.terminalIds.length) {
        out.terminalIds = Array.isArray(other.terminalIds) ? other.terminalIds.slice() : [];
    }

    out.specialNames = Array.from(new Set([
        ...(Array.isArray(out.specialNames) ? out.specialNames : []),
        ...(Array.isArray(other.specialNames) ? other.specialNames : [])
    ].map((x) => toText(x)).filter(Boolean)));
    out.hasNm = !!(out.hasNm || other.hasNm);
    out.hasNameMeta = !!(out.hasNameMeta || other.hasNameMeta);
    out.originIdsCount = Math.max(Number(out.originIdsCount) || 0, Number(other.originIdsCount) || 0);
    out.terminalIdsCount = Math.max(Number(out.terminalIdsCount) || 0, Number(other.terminalIdsCount) || 0);
    out.hasNt = !!(out.hasNt || other.hasNt);
    out.resolvedTerminalIdsCount = Math.max(Number(out.resolvedTerminalIdsCount) || 0, Number(other.resolvedTerminalIdsCount) || 0);

    return out;
};

export const mergeDuplicateTimetableRows = (rows, {
    toText = defaultToText_panelTimetableViewModel
} = {}) => {
    const merged = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
        const base = toText(row?.baseTripKey) || toText(row?.tripKey);
        const dirKey = toText(row?.dir) || 'Unknown';
        const timeMs = Number(row?.timeMs);
        if (!base || !Number.isFinite(timeMs)) {
            merged.set(Symbol('row'), row);
            continue;
        }

        const key = `${base}||${dirKey}||${timeMs}`;
        const prev = merged.get(key);
        if (!prev) {
            merged.set(key, row);
            continue;
        }

        const keepRow = rowPickScore_panelTimetableViewModel(row, { toText }) > rowPickScore_panelTimetableViewModel(prev, { toText });
        const primary = keepRow ? row : prev;
        const secondary = keepRow ? prev : row;
        merged.set(key, mergeRowMetadata_panelTimetableViewModel(primary, secondary, { toText }));
    }

    return Array.from(merged.values());
};

export const deriveDirectionStats = (rows, {
    destNameMinCount = 0,
    toText = defaultToText_panelTimetableViewModel
} = {}) => {
    const inputRows = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : []);
    const minCount = Number(rows?.destNameMinCount ?? destNameMinCount) || 0;
    const dirToDestCounts = new Map();
    const dirOrder = [];
    const dirSeen = new Set();

    for (const row of inputRows) {
        const dirKey = toText(row?.dir) || 'Unknown';
        if (!dirToDestCounts.has(dirKey)) dirToDestCounts.set(dirKey, new Map());
        if (!dirSeen.has(dirKey)) {
            dirSeen.add(dirKey);
            dirOrder.push(dirKey);
        }
        const counts = dirToDestCounts.get(dirKey);
        const names = Array.isArray(row?.destNamesForDir) ? row.destNamesForDir : [];
        for (const name of names) {
            const label = toText(name);
            if (!label) continue;
            counts.set(label, (counts.get(label) || 0) + 1);
        }
    }

    let anyDestAboveThreshold = false;
    for (const counts of dirToDestCounts.values()) {
        for (const count of counts.values()) {
            if (Number(count) >= minCount) {
                anyDestAboveThreshold = true;
                break;
            }
        }
        if (anyDestAboveThreshold) break;
    }

    const dirMetrics = new Map();
    for (const dirKey of dirOrder) {
        const counts = dirToDestCounts.get(dirKey) || new Map();
        let maxCount = 0;
        let sumCount = 0;
        for (const count of counts.values()) {
            const n = Number(count) || 0;
            sumCount += n;
            if (n > maxCount) maxCount = n;
        }
        const rowsForDirLen = inputRows.filter((row) => (toText(row?.dir) || 'Unknown') === dirKey).length;
        if (!sumCount) sumCount = rowsForDirLen;
        if (!maxCount) maxCount = rowsForDirLen ? Math.max(1, Math.floor(rowsForDirLen / 2)) : 0;
        dirMetrics.set(dirKey, { maxCount, sumCount });
    }

    dirOrder.sort((a, b) => {
        const ma = dirMetrics.get(a) || { maxCount: 0, sumCount: 0 };
        const mb = dirMetrics.get(b) || { maxCount: 0, sumCount: 0 };
        if (mb.maxCount !== ma.maxCount) return mb.maxCount - ma.maxCount;
        if (mb.sumCount !== ma.sumCount) return mb.sumCount - ma.sumCount;
        return String(a).localeCompare(String(b));
    });

    return {
        anyDestAboveThreshold,
        dirMetrics,
        dirOrder,
        dirToDestCounts
    };
};

export const buildTimetablePrintPayload = ({
    companyLogoMap = {},
    currentStationName = '',
    dirKey,
    dirLabel,
    generatedAt = Date.now(),
    getCompanyLogoSrc = () => '',
    gridHintsHtml = '',
    gridHtml = '',
    lineId,
    lineMeta = {},
    listHtml = '',
    serviceDay = '',
    stationInfoHtml = '',
    timetableViewMode = '',
    titleText = '',
    toText = defaultToText_panelTimetableViewModel
} = {}) => {
    const companyKey = toText(lineMeta?.company);
    const companyInfo = companyLogoMap?.[companyKey] || {};
    return {
        companyLogoSrc: toText(getCompanyLogoSrc(companyKey, companyLogoMap)),
        companyName: toText(companyInfo?.zh) || companyKey || '鏈煡鍏徃',
        companyType: toText(companyInfo?.type) || '',
        dirKey: toText(dirKey),
        dirLabel: toText(dirLabel),
        generatedAt,
        gridHintsHtml,
        gridHtml,
        lineColor: toText(lineMeta?.color),
        lineId: toText(lineId),
        lineName: toText(lineMeta?.name) || toText(lineId),
        listHtml,
        serviceDay: toText(serviceDay),
        stationInfoHtml: toText(stationInfoHtml),
        stationName: toText(currentStationName) || toText(titleText),
        timetableViewMode
    };
};

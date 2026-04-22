const toText = (v) => String(v ?? '').trim();

const escapeHtml = (input) => {
    const s = String(input ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const createEl = (tag, className, text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = String(text);
    return node;
};

const parseCssColorToRgb = (input) => {
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

const relativeLuminance = ({ r, g, b }) => {
    const toLinear = (v) => {
        const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
        return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const getBadgeTextColor = (bgColor) => {
    const parsed = parseCssColorToRgb(bgColor);
    if (!parsed) return '#fff';
    return relativeLuminance(parsed) > 0.55 ? '#111' : '#fff';
};

export const buildTimetableStationText = ({ stationCode = '', stationName = '', stationId = '' } = {}) => {
    const name = toText(stationName || stationId);
    const code = toText(stationCode);
    return code ? `${code} ${name}` : name;
};

export const renderTimetableNoteRowHtml = ({
    rowClass = '',
    dotClass = '',
    lineClass = '',
    typeClass = '',
    lineText = '',
    lineColor = '',
    dotColor = '',
    typeText = '',
    typeColor = ''
} = {}) => {
    const safeRowClass = toText(rowClass);
    const safeDotClass = toText(dotClass);
    const safeLineClass = toText(lineClass);
    const safeTypeClass = toText(typeClass);
    const safeLineText = toText(lineText);
    const safeLineColor = toText(lineColor);
    const safeDotColor = toText(dotColor);
    const safeTypeText = toText(typeText);
    const safeTypeColor = toText(typeColor);

    if (!safeRowClass || !safeLineClass || !safeLineText) return '';

    const dotHtml = safeDotClass
        ? `<span class="${escapeHtml(safeDotClass)}"${safeDotColor ? ` style="background:${escapeHtml(safeDotColor)}"` : ''}></span>`
        : '';
    const lineHtml = `<span class="${escapeHtml(safeLineClass)}"${safeLineColor ? ` style="color:${escapeHtml(safeLineColor)}"` : ''}>${escapeHtml(safeLineText)}</span>`;
    const typeHtml = (safeTypeClass && safeTypeText)
        ? `<span class="${escapeHtml(safeTypeClass)}"${safeTypeColor ? ` style="background:${escapeHtml(safeTypeColor)};color:${escapeHtml(getBadgeTextColor(safeTypeColor))}"` : ''}>${escapeHtml(safeTypeText)}</span>`
        : '';

    return `<div class="${escapeHtml(safeRowClass)}">${dotHtml}${lineHtml}${typeHtml}</div>`;
};

export const renderTimetablePlainNoteRowHtml = ({
    rowClass = '',
    lineClass = '',
    text = ''
} = {}) => {
    const safeRowClass = toText(rowClass);
    const safeLineClass = toText(lineClass);
    const safeText = toText(text);
    if (!safeRowClass || !safeLineClass || !safeText) return '';
    return `<div class="${escapeHtml(safeRowClass)}"><span class="${escapeHtml(safeLineClass)}">${escapeHtml(safeText)}</span></div>`;
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
    const safeRowClass = toText(rowClass);
    const safeStationClass = toText(stationClass);
    const safeArriveCellClass = toText(arriveCellClass);
    const safeDepartCellClass = toText(departCellClass);
    const safeArriveTextClass = toText(arriveTextClass);
    const safeDepartTextClass = toText(departTextClass);
    const safeStationId = toText(stationId);
    const safeStationText = toText(stationText);
    const safeLineColor = toText(lineColor);
    const safeArrivalText = toText(arrivalText);
    const safeDepartureText = toText(departureText);

    if (!safeRowClass || !safeStationClass || !safeArriveCellClass || !safeDepartCellClass) return '';

    const stationAttrs = [
        `class="${escapeHtml(safeStationClass)}"`,
        safeStationId ? `data-station-id="${escapeHtml(safeStationId)}"` : '',
        safeLineColor ? `data-line-color="${escapeHtml(safeLineColor)}"` : ''
    ].filter(Boolean).join(' ');

    const arriveHtml = safeArrivalText && safeArriveTextClass
        ? `<span class="${escapeHtml(safeArriveTextClass)}">${escapeHtml(safeArrivalText)}</span>`
        : '';
    const departHtml = safeDepartureText && safeDepartTextClass
        ? `<span class="${escapeHtml(safeDepartTextClass)}">${escapeHtml(safeDepartureText)}</span>`
        : '';

    return `
        <div class="${escapeHtml(safeRowClass)}">
            <div ${stationAttrs}>${escapeHtml(safeStationText)}</div>
            <div class="${escapeHtml(safeArriveCellClass)}">${arrivalLabelHtml || ''}${arriveHtml}</div>
            <div class="${escapeHtml(safeDepartCellClass)}">${departLabelHtml || ''}${departHtml}</div>
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
    const row = createEl('div', rowClass);
    const dot = dotClass ? createEl('span', dotClass) : null;
    if (dot && dotColor) dot.style.background = String(dotColor);
    if (dot) row.appendChild(dot);

    const line = createEl('span', lineClass, lineText);
    if (lineColor) line.style.color = String(lineColor);
    row.appendChild(line);

    if (directionClass && toText(directionText)) {
        row.appendChild(createEl('span', directionClass, directionText));
    }

    if (typeClass && toText(typeText)) {
        const type = createEl('span', typeClass, typeText);
        if (typeColor) {
            const bg = String(typeColor);
            type.style.background = bg;
            type.style.color = getBadgeTextColor(bg);
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
    const row = createEl('div', rowClass);
    const station = createEl('div', stationClass, stationText);
    if (toText(stationId)) station.setAttribute('data-station-id', toText(stationId));
    row.appendChild(station);

    const arrive = createEl('div', arriveCellClass);
    if (toText(arrivalText) && arriveTextClass) {
        arrive.appendChild(createEl('span', arriveTextClass, arrivalText));
    }
    row.appendChild(arrive);

    const depart = createEl('div', departCellClass);
    if (showDestination && destinationTextClass && toText(destinationText)) {
        depart.appendChild(createEl('span', destinationTextClass, destinationText));
    } else if (toText(departureText) && departTextClass) {
        depart.appendChild(createEl('span', departTextClass, departureText));
    }
    row.appendChild(depart);

    return row;
};
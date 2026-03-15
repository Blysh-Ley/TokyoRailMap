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
        ? `<span class="${escapeHtml(safeTypeClass)}"${safeTypeColor ? ` style="color:${escapeHtml(safeTypeColor)}"` : ''}>${escapeHtml(safeTypeText)}</span>`
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
        if (typeColor) type.style.color = String(typeColor);
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
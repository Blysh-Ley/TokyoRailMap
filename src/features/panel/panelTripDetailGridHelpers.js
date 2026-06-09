const defaultToText = (value) => String(value ?? '').trim();

export const renderPanelTripDetailGridNoteCell = ({
    descriptor,
    typeName,
    typeColor,
    isPast,
    colStart,
    colSpan = 3,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText
} = {}) => {
    if (!descriptor?.text) return '';
    const past = !!isPast;
    const lineColor = past ? '#ccc' : toText(descriptor?.color);
    const dotColor = past ? '#ccc' : toText(descriptor?.color);
    const safeTypeName = toText(typeName);
    const safeTypeColor = past ? '' : toText(typeColor);
    const noteCls = `panel-trip-detail-note-row panel-trip-detail-grid-note${past ? ' is-past' : ''}`;
    const col = Number(colStart) || 1;
    const span = Math.max(1, Number(colSpan) || 3);
    return `
        <div class="${noteCls}" style="grid-column:${col} / span ${span};">
            <span class="panel-trip-detail-note-dot"${dotColor ? ` style="background:${escapeHtml(dotColor)}"` : ''}></span>
            <span class="panel-trip-detail-note-line"${lineColor ? ` style="color:${escapeHtml(lineColor)}"` : ''}>${escapeHtml(toText(descriptor?.text))}</span>
            ${safeTypeName ? `<span class="panel-trip-detail-note-type"${safeTypeColor ? ` style="color:${escapeHtml(safeTypeColor)}"` : ''}>${escapeHtml(safeTypeName)}</span>` : ''}
        </div>
    `;
};

export const renderPanelTripDetailGridStopCellsSharedStation = ({
    stop,
    timeColStart,
    lineColor,
    rowMarkerCol = 0,
    rowMarkerText = '',
    stationCode = '',
    stationName = '',
    renderPanelTripDetailStationCellHtml,
    renderTripDetailMomentHtml,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText
} = {}) => {
    const s = stop || {};
    const timeCol = Math.max(2, Number(timeColStart) || 2);
    const stationId = toText(s.stationId);
    const pastCls = s.isPast ? ' is-past' : '';
    const safeLineColor = toText(lineColor);
    const markerCol = Number(rowMarkerCol) || 0;
    const markerText = toText(rowMarkerText);
    const stationHtml = renderPanelTripDetailStationCellHtml({
        className: `panel-trip-detail-station panel-trip-detail-grid-cell${pastCls}`,
        style: 'grid-column:1;',
        dataStationId: stationId,
        lineColor: safeLineColor,
        stationCode: toText(stationCode),
        stationName: toText(stationName || s.stationName || stationId),
        stationId
    });
    const timeHtml = `<div class="panel-trip-detail-time panel-trip-detail-moment panel-trip-detail-grid-cell${pastCls}" style="grid-column:${timeCol} / span 2;">${renderTripDetailMomentHtml(s)}</div>`;
    const cells = [
        { col: 1, html: stationHtml },
        { col: timeCol, html: timeHtml }
    ];
    if (markerCol > 0 && markerText) {
        const markerHtml = `<div class="panel-trip-detail-grid-break-marker panel-trip-detail-grid-flow-marker${pastCls}" style="grid-column:${markerCol};">${escapeHtml(markerText)}</div>`;
        cells.push({ col: markerCol, html: markerHtml });
    }
    cells.sort((a, b) => a.col - b.col);
    return cells.map((value) => value.html).join('');
};

export const renderPanelTripDetailGridMarkerCell = ({
    text,
    col,
    isPast = false,
    className = '',
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText
} = {}) => {
    const safeText = toText(text);
    if (!safeText) return '';
    const markerCol = Math.max(1, Number(col) || 1);
    const cls = `panel-trip-detail-grid-break-marker${isPast ? ' is-past' : ''}${className ? ` ${className}` : ''}`;
    return `<div class="${cls}" style="grid-column:${markerCol};">${escapeHtml(safeText)}</div>`;
};

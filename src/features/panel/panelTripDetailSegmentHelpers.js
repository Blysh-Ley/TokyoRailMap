const defaultToText = (value) => String(value ?? '').trim();

export const renderPanelTripDetailNoteRow = ({
    descriptor,
    typeName,
    typeColor,
    isPast,
    renderTimetableNoteRowHtml,
    toText = defaultToText
} = {}) => {
    if (!descriptor?.text) return '';
    const past = !!isPast;
    return renderTimetableNoteRowHtml({
        rowClass: past ? 'panel-trip-detail-note-row is-past' : 'panel-trip-detail-note-row',
        dotClass: 'panel-trip-detail-note-dot',
        lineClass: 'panel-trip-detail-note-line',
        typeClass: 'panel-trip-detail-note-type',
        lineText: descriptor.text,
        lineColor: past ? '#ccc' : toText(descriptor.color),
        dotColor: past ? '#ccc' : toText(descriptor.color),
        typeText: toText(typeName),
        typeColor: past ? '' : toText(typeColor)
    });
};

export const getPanelTripDetailSegmentFirstRow = (segment) => (
    Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[0] : null
);

export const getPanelTripDetailSegmentLastRow = (segment) => (
    Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[segment.rows.length - 1] : null
);

export const isPanelTripDetailBoundaryPast = (leftRow, rightRow) => {
    if (leftRow && rightRow) return !!(leftRow.isPast && rightRow.isPast);
    if (leftRow) return !!leftRow.isPast;
    if (rightRow) return !!rightRow.isPast;
    return false;
};

export const renderPanelTripDetailLoopMarkerRow = ({
    text,
    renderTimetablePlainNoteRowHtml,
    toText = defaultToText
} = {}) => {
    const label = toText(text);
    if (!label) return '';
    return renderTimetablePlainNoteRowHtml({
        rowClass: 'panel-trip-detail-note-row',
        lineClass: 'panel-trip-detail-note-line',
        text: label
    });
};

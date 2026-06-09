const defaultToText = (value) => String(value ?? '').trim();

const BRANCH_SPLIT = 'split';
const SPLIT_MARKER_LEFT = '\u2523';
const MERGE_MARKER_LEFT = '\u2523';
const SPLIT_MARKER_RIGHT = '\u2513';
const MERGE_MARKER_RIGHT = '\u251b';
const SPLIT_LABEL = '\u89e3\u7f16';
const MERGE_LABEL = '\u5e76\u7ed3';
const SPLIT_STATION_SUFFIX = '\u7ad9\u89e3\u7f16';
const MERGE_STATION_SUFFIX = '\u7ad9\u5e76\u7ed3';
const SPLIT_STATION_FALLBACK = '\u89e3\u7f16\u7ad9';
const MERGE_STATION_FALLBACK = '\u5e76\u7ed3\u7ad9';

export const renderPanelTripDetailBranchBreakRow = ({
    branchMode,
    breakStop,
    breakIsPast = false,
    totalCols,
    primaryTimeColStart,
    firstBranchMarkerCol = 0,
    lineColor = '',
    stationCode = '',
    stationName = '',
    buildTimetableStationText,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText
} = {}) => {
    const safeBranchMode = toText(branchMode) === BRANCH_SPLIT ? BRANCH_SPLIT : 'merge';
    const breakStationId = toText(breakStop?.stationId || '');
    const pastCls = breakIsPast ? ' is-past' : '';
    const safeStationCode = toText(stationCode);
    const safeStationName = toText(stationName || breakStop?.stationName || breakStationId);
    const rowStart = `<div class="panel-trip-detail-grid-break-row${pastCls}" style="grid-column:1 / span ${totalCols}; --panel-trip-detail-cols:${totalCols};">`;
    const rowEnd = '</div>';
    const markerLeft = renderPanelTripDetailGridMarkerCell({
        text: safeBranchMode === BRANCH_SPLIT ? SPLIT_MARKER_LEFT : MERGE_MARKER_LEFT,
        col: primaryTimeColStart,
        isPast: breakIsPast,
        escapeHtml,
        toText
    });
    const markerCenter = renderPanelTripDetailGridMarkerCell({
        text: safeBranchMode === BRANCH_SPLIT ? SPLIT_LABEL : MERGE_LABEL,
        col: Number(primaryTimeColStart) + 1,
        isPast: breakIsPast,
        escapeHtml,
        toText
    });
    const markerRight = firstBranchMarkerCol
        ? renderPanelTripDetailGridMarkerCell({
            text: safeBranchMode === BRANCH_SPLIT ? SPLIT_MARKER_RIGHT : MERGE_MARKER_RIGHT,
            col: firstBranchMarkerCol,
            isPast: breakIsPast,
            escapeHtml,
            toText
        })
        : '';

    const breakStationText = breakStationId
        ? `${buildTimetableStationText({
            stationCode: safeStationCode,
            stationName: safeStationName,
            stationId: breakStationId
        })}${safeBranchMode === BRANCH_SPLIT ? SPLIT_STATION_SUFFIX : MERGE_STATION_SUFFIX}`
        : (safeBranchMode === BRANCH_SPLIT ? SPLIT_STATION_FALLBACK : MERGE_STATION_FALLBACK);

    const breakStationHtml = renderPanelTripDetailStationCellHtml({
        className: `panel-trip-detail-station panel-trip-detail-grid-cell${pastCls}`,
        style: 'grid-column:1;',
        lineColor: toText(lineColor),
        stationCode: breakStationId ? safeStationCode : '',
        stationName: breakStationText.replace(/^\S+\s+/, ''),
        stationId: breakStationId
    });

    return `${rowStart}${breakStationHtml}${markerLeft}${markerCenter}${markerRight}${rowEnd}`;
};

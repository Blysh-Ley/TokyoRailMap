const defaultToText = (value) => String(value ?? '').trim();

export const renderPanelTripDetailBranchGridRows = ({
    branchMode = '',
    buildTimetableStationText,
    escapeHtml = defaultToText,
    firstBranchMarkerCol = 0,
    mainDescriptor = null,
    mainRows = [],
    markRowsPastByCurrentStation = (rows) => rows,
    primaryLane = null,
    primaryTimeColStart = 0,
    renderPanelTripDetailBranchBreakRow,
    renderPanelTripDetailGridLaneBlock,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml,
    renderTripDetailMomentHtml,
    resolveStationCode = () => '',
    secondaryLanes = [],
    toText = defaultToText,
    totalCols = 0,
    typeColor = '',
    typeName = ''
} = {}) => {
    const renderMainBlock = () => {
        const mainLineColor = toText(mainDescriptor?.color || typeColor || '');
        return renderPanelTripDetailGridLaneBlock({
            descriptor: mainDescriptor,
            typeName,
            typeColor,
            rows: mainRows,
            timeColStart: primaryTimeColStart,
            totalCols,
            lineColor: mainLineColor,
            resolveStationCode,
            renderPanelTripDetailStationCellHtml,
            renderTripDetailMomentHtml,
            escapeHtml,
            toText
        });
    };

    const renderLaneBlockAt = (lane, timeColStart, flowMarkerCol = 0, fallbackPast = false) => {
        if (!lane) return '';
        const laneBaseRows = Array.isArray(lane?.rows) ? lane.rows : [];
        const laneRows = markRowsPastByCurrentStation(laneBaseRows, fallbackPast);
        const laneLineColor = toText(lane?.descriptor?.color || lane?.typeColor || '');
        return renderPanelTripDetailGridLaneBlock({
            descriptor: lane.descriptor,
            typeName: lane.typeName,
            typeColor: lane.typeColor,
            rows: laneRows,
            timeColStart,
            totalCols,
            lineColor: laneLineColor,
            flowMarkerCol,
            rowMarkerText: flowMarkerCol > 0 ? '||' : '',
            resolveStationCode,
            renderPanelTripDetailStationCellHtml,
            renderTripDetailMomentHtml,
            escapeHtml,
            toText
        });
    };

    const renderBreakRow = () => {
        const laneRowsForBreak = markRowsPastByCurrentStation(
            Array.isArray(primaryLane?.rows) ? primaryLane.rows : [],
            branchMode === 'split'
                ? !!mainRows[mainRows.length - 1]?.isPast
                : !!mainRows[0]?.isPast
        );
        const breakStop = branchMode === 'split'
            ? (laneRowsForBreak[0] || null)
            : (laneRowsForBreak[laneRowsForBreak.length - 1] || null);
        const breakIsPast = !!breakStop?.isPast;
        const breakStationId = toText(breakStop?.stationId || '');
        return renderPanelTripDetailBranchBreakRow({
            branchMode,
            breakStop,
            breakIsPast,
            totalCols,
            primaryTimeColStart,
            firstBranchMarkerCol,
            lineColor: toText(primaryLane?.descriptor?.color || mainDescriptor?.color || typeColor || ''),
            stationCode: breakStationId ? toText(resolveStationCode(breakStationId) || '') : '',
            stationName: toText(breakStop?.stationName || breakStationId),
            buildTimetableStationText,
            renderPanelTripDetailGridMarkerCell,
            renderPanelTripDetailStationCellHtml,
            escapeHtml,
            toText
        });
    };

    let rowsHtml = '';
    if (branchMode === 'merge') {
        const mergeFallbackPast = !!mainRows[0]?.isPast;
        rowsHtml += renderLaneBlockAt(primaryLane, primaryTimeColStart, 0, mergeFallbackPast);
        for (let i = 0; i < secondaryLanes.length; i += 1) {
            rowsHtml += renderLaneBlockAt(secondaryLanes[i], 4 + i * 2, primaryTimeColStart, mergeFallbackPast);
        }
        rowsHtml += renderBreakRow();
        rowsHtml += renderMainBlock();
        return rowsHtml;
    }

    const splitFallbackPast = !!mainRows[mainRows.length - 1]?.isPast;
    rowsHtml += renderMainBlock();
    rowsHtml += renderBreakRow();
    rowsHtml += renderLaneBlockAt(primaryLane, primaryTimeColStart, firstBranchMarkerCol, splitFallbackPast);

    for (let i = 0; i < secondaryLanes.length; i += 1) {
        rowsHtml += renderLaneBlockAt(secondaryLanes[i], 4 + i * 2, 0, splitFallbackPast);
    }

    return rowsHtml;
};

import {
    renderPanelTripDetailGridNoteCell,
    renderPanelTripDetailGridStopCellsSharedStation
} from './panelTripDetailGridHelpers.js';

const defaultToText = (value) => String(value ?? '').trim();

export const renderPanelTripDetailGridLaneBlock = ({
    descriptor,
    typeName,
    typeColor,
    rows,
    timeColStart,
    totalCols,
    lineColor = '',
    flowMarkerCol = 0,
    rowMarkerText = '',
    resolveStationCode = () => '',
    renderPanelTripDetailStationCellHtml,
    renderTripDetailMomentHtml,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText
} = {}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const isPast = safeRows.length ? !!safeRows[0]?.isPast : false;
    let html = renderPanelTripDetailGridNoteCell({
        descriptor,
        typeName,
        typeColor,
        isPast,
        colStart: 1,
        colSpan: totalCols,
        escapeHtml,
        toText
    });

    const safeLineColor = toText(lineColor);
    for (const row of safeRows) {
        const stationId = toText(row?.stationId);
        html += renderPanelTripDetailGridStopCellsSharedStation({
            stop: { ...(row || {}), lineColor: safeLineColor },
            timeColStart,
            lineColor: safeLineColor,
            rowMarkerCol: flowMarkerCol,
            rowMarkerText,
            stationCode: toText(resolveStationCode(stationId)),
            stationName: toText(row?.stationName || stationId),
            renderPanelTripDetailStationCellHtml,
            renderTripDetailMomentHtml,
            escapeHtml,
            toText
        });
    }

    return html;
};

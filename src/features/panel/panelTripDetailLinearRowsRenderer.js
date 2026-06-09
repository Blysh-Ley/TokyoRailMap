const LOOP_MARKER_UP = '\u2191\u73af\u7ebf';
const LOOP_MARKER_DOWN = '\u2193\u73af\u7ebf';

export const renderPanelTripDetailLinearRows = ({
    segmentBlocks,
    hideThroughSegmentsForLoop = false,
    renderPanelTripDetailLoopMarkerRow = () => '',
    getPanelTripDetailSegmentFirstRow = () => null,
    getPanelTripDetailSegmentLastRow = () => null,
    isPanelTripDetailBoundaryPast = () => false,
    renderPanelTripDetailNoteRow = () => '',
    renderStopRow = () => ''
} = {}) => {
    const blocks = Array.isArray(segmentBlocks) ? segmentBlocks : [];
    let rowsHtml = '';

    if (hideThroughSegmentsForLoop) {
        rowsHtml += renderPanelTripDetailLoopMarkerRow({
            text: LOOP_MARKER_UP
        });
    }

    for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const prevBlock = i > 0 ? blocks[i - 1] : null;
        const firstSeg = block?.segments?.[0] || null;
        const prevLastSeg = prevBlock?.segments?.[prevBlock.segments.length - 1] || null;
        const prevLastRow = getPanelTripDetailSegmentLastRow(prevLastSeg);
        const firstRow = getPanelTripDetailSegmentFirstRow(firstSeg);

        rowsHtml += renderPanelTripDetailNoteRow({
            descriptor: block?.descriptor,
            typeName: block?.typeName,
            typeColor: block?.typeColor,
            isPast: isPanelTripDetailBoundaryPast(prevLastRow, firstRow)
        });

        for (const seg of Array.isArray(block?.segments) ? block.segments : []) {
            const segLineColor = String(block?.descriptor?.color || seg?.typeColor || '').trim();
            rowsHtml += (Array.isArray(seg?.rows) ? seg.rows : [])
                .map((row) => renderStopRow({ ...(row || {}), lineColor: segLineColor }))
                .join('');
        }
    }

    if (hideThroughSegmentsForLoop) {
        rowsHtml += renderPanelTripDetailLoopMarkerRow({
            text: LOOP_MARKER_DOWN
        });
    }

    return rowsHtml;
};

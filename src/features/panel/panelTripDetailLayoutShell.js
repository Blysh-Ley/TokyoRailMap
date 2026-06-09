const DEFAULT_TABLE_CLASS = 'panel-trip-detail-table';
const BRANCH_TABLE_CLASS = 'panel-trip-detail-table is-branch-grid';
const DEFAULT_SPACER_HTML = '<div class="panel-trip-detail-spacer"></div>';
const STATION_LABEL = '\u8f66\u7ad9';
const TIME_LABEL = '\u65f6\u523b';

export const buildPanelTripDetailLayoutShell = ({
    useBranchGridLayout = false,
    branchCount = 0
} = {}) => {
    if (!useBranchGridLayout) {
        return {
            tripDetailTableClass: DEFAULT_TABLE_CLASS,
            tripDetailTableInlineStyle: '',
            spacerHtml: DEFAULT_SPACER_HTML,
            headerHtml: `
                <div class="panel-trip-detail-head">
                    <div class="panel-trip-detail-station">${STATION_LABEL}</div>
                    <div class="panel-trip-detail-time panel-trip-detail-moment">${TIME_LABEL}</div>
                </div>
            `,
            totalCols: 0,
            primaryTimeColStart: 0,
            firstBranchMarkerCol: 0
        };
    }

    const safeBranchCount = Math.max(0, Number(branchCount) || 0);
    const totalCols = 2 * safeBranchCount + 1;
    const primaryTimeColStart = 2;
    const firstBranchMarkerCol = safeBranchCount >= 2 ? 4 : 0;
    let branchHeadHtml = '';
    for (let i = 0; i < safeBranchCount; i += 1) {
        const colStart = 2 + 2 * i;
        branchHeadHtml += `
            <div class="panel-trip-detail-head-cell panel-trip-detail-time panel-trip-detail-moment" style="grid-column:${colStart} / span 2;">${TIME_LABEL}</div>
        `;
    }

    return {
        tripDetailTableClass: BRANCH_TABLE_CLASS,
        tripDetailTableInlineStyle: ` style="--panel-trip-detail-cols:${totalCols};--panel-trip-detail-branch-count:${safeBranchCount};"`,
        spacerHtml: `<div class="panel-trip-detail-spacer panel-trip-detail-grid-spacer" style="grid-column:1 / span ${totalCols};"></div>`,
        headerHtml: `
            <div class="panel-trip-detail-head-cell panel-trip-detail-station" style="grid-column:1;">${STATION_LABEL}</div>
            ${branchHeadHtml}
        `,
        totalCols,
        primaryTimeColStart,
        firstBranchMarkerCol
    };
};

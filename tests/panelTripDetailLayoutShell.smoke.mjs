import assert from 'node:assert/strict';

import { buildPanelTripDetailLayoutShell } from '../src/features/panel/panelTripDetailLayoutShell.js';

const linearShell = buildPanelTripDetailLayoutShell({
    useBranchGridLayout: false,
    branchCount: 0
});

assert.equal(linearShell.tripDetailTableClass, 'panel-trip-detail-table');
assert.equal(linearShell.tripDetailTableInlineStyle, '');
assert.equal(linearShell.spacerHtml, '<div class="panel-trip-detail-spacer"></div>');
assert.match(linearShell.headerHtml, /\u8f66\u7ad9/);
assert.match(linearShell.headerHtml, /\u65f6\u523b/);
assert.equal(linearShell.totalCols, 0);

const branchShell = buildPanelTripDetailLayoutShell({
    useBranchGridLayout: true,
    branchCount: 3
});

assert.equal(branchShell.tripDetailTableClass, 'panel-trip-detail-table is-branch-grid');
assert.equal(branchShell.totalCols, 7);
assert.equal(branchShell.primaryTimeColStart, 2);
assert.equal(branchShell.firstBranchMarkerCol, 4);
assert.match(branchShell.tripDetailTableInlineStyle, /--panel-trip-detail-cols:7/);
assert.match(branchShell.spacerHtml, /grid-column:1 \/ span 7/);
assert.match(branchShell.headerHtml, /grid-column:2 \/ span 2/);
assert.match(branchShell.headerHtml, /grid-column:6 \/ span 2/);

console.log('panel trip-detail layout shell smoke ok');

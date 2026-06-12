import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const renderSource = readFileSync(join(process.cwd(), 'src/features/panel/panelTripDetailRender.js'), 'utf8');
const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');
const transferSource = readFileSync(join(process.cwd(), 'src/features/panel/panelTripDetailTransfers.js'), 'utf8');
const tripDetailViewSource = readFileSync(join(process.cwd(), 'src/ui/panelTripDetailView.js'), 'utf8');
const transferPortalSource = readFileSync(join(process.cwd(), 'src/ui/panelTripDetailTransferHoverPortal.js'), 'utf8');
const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');

assert.match(
    renderSource,
    /\$\{timeCellHtml\}[\s\S]*renderPanelTripDetailStationCellHtml[\s\S]*renderPanelTripDetailTransferCellHtml\(transferDisplay \|\| \{\}\)/,
    'default trip detail rows should render time, station, then transfer'
);
assert.match(
    renderSource,
    /panel-trip-detail-time panel-trip-detail-moment">\$\{TIME_LABEL_panelTripDetailLayoutShell\}[\s\S]*panel-trip-detail-station">\$\{STATION_LABEL_panelTripDetailLayoutShell\}[\s\S]*panel-trip-detail-transfer">\$\{'\\u6362\\u4e58'\}/,
    'default trip detail header should render time, station, then transfer'
);
assert.match(renderSource, /const\s+primaryTimeColStart\s*=\s*1/);
assert.match(renderSource, /const\s+stationColStart\s*=\s*Math\.max\(1,\s*totalCols - 1\)/);
assert.match(renderSource, /const\s+transferColStart\s*=\s*totalCols/);
assert.match(renderSource, /const\s+MAX_PANEL_TRIP_DETAIL_TRANSFER_ITEMS_PER_ROW\s*=\s*5/);
assert.match(renderSource, /panel-trip-detail-transfer-items-main/);
assert.match(renderSource, /panel-trip-detail-transfer-items-popover/);
assert.match(renderSource, /style:\s*`grid-column:\$\{stationCol\};`/);
assert.match(panelSource, /renderPanelTripDetailBranchGridRows\(\{[\s\S]*stationColStart,/);
assert.doesNotMatch(panelSource, /createLineIconElement/);
assert.doesNotMatch(panelSource, /renderPanelTripDetailTransferCellHtml/);
assert.match(panelSource, /buildTripDetailTransferDisplayByStationId\(\{[\s\S]*getStationGroupsIndex,/);
assert.match(transferSource, /buildCompactTripDetailTransferItemHtmls/);
assert.match(transferSource, /key:\s*`code\|\|\$\{company\}\|\|\$\{code\}`/);
assert.match(transferSource, /key:\s*`color\|\|\$\{company\}\|\|\$\{iconColor\}`/);
assert.match(tripDetailViewSource, /createPanelTripDetailTransferHoverPortal/);
assert.match(transferPortalSource, /doc\.body\.appendChild\(portal\)/);
assert.match(transferPortalSource, /position\(shell\)/);
assert.match(cssSource, /\.panel-trip-detail-transfer-hover-panel\s*\{\s*display:\s*none;/);
assert.match(cssSource, /\.panel-trip-detail-transfer-hover-portal\s*\{[\s\S]*position:\s*fixed;/);
assert.match(
    cssSource,
    /grid-template-columns:\s*repeat\(var\(--panel-trip-detail-branch-count,\s*2\),\s*minmax\(0,\s*0\.9fr\)\s*minmax\(0,\s*0\.9fr\)\)\s*minmax\(0,\s*1\.5fr\)\s*minmax\(0,\s*104px\);/
);
assert.match(cssSource, /max-width:\s*min\(440px,\s*calc\(100vw - 40px\)\)/);

console.log('panel trip detail column order smoke ok');

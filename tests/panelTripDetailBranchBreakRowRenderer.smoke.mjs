import assert from 'node:assert/strict';

import { renderPanelTripDetailBranchBreakRow } from '../src/features/panel/panelTripDetailBranchBreakRowRenderer.js';
import { renderPanelTripDetailGridMarkerCell } from '../src/features/panel/panelTripDetailGridHelpers.js';

const splitHtml = renderPanelTripDetailBranchBreakRow({
    branchMode: 'split',
    breakStop: { stationId: 'station-a', stationName: '\u6e0b\u8c37' },
    breakIsPast: true,
    totalCols: 5,
    primaryTimeColStart: 2,
    firstBranchMarkerCol: 4,
    lineColor: '#005aaa',
    stationCode: 'JY20',
    stationName: '\u6e0b\u8c37',
    buildTimetableStationText: ({ stationCode, stationName }) => `${stationCode} ${stationName}`,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml: (input) => `<station data='${JSON.stringify(input)}'></station>`
});

assert.match(splitHtml, /panel-trip-detail-grid-break-row is-past/);
assert.match(splitHtml, /\u89e3\u7f16/);
assert.match(splitHtml, /\u7ad9\u89e3\u7f16/);
assert.match(splitHtml, /\u2523/);
assert.match(splitHtml, /\u2513/);
assert.match(splitHtml, /JY20/);

const mergeHtml = renderPanelTripDetailBranchBreakRow({
    branchMode: 'merge',
    breakStop: null,
    breakIsPast: false,
    totalCols: 5,
    primaryTimeColStart: 2,
    firstBranchMarkerCol: 4,
    lineColor: '#005aaa',
    stationCode: '',
    stationName: '',
    buildTimetableStationText: ({ stationCode, stationName }) => `${stationCode} ${stationName}`,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml: (input) => `<station data='${JSON.stringify(input)}'></station>`
});

assert.match(mergeHtml, /\u5e76\u7ed3/);
assert.match(mergeHtml, /\u5e76\u7ed3\u7ad9/);
assert.match(mergeHtml, /\u251b/);

console.log('panel trip-detail branch break row renderer smoke ok');

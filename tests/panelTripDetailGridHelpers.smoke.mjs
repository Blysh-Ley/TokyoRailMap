import assert from 'node:assert/strict';

import {
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailGridNoteCell,
    renderPanelTripDetailGridStopCellsSharedStation
} from '../src/features/panel/panelTripDetailGridHelpers.js';

const noteHtml = renderPanelTripDetailGridNoteCell({
    descriptor: { text: '\u5c71\u624b\u7ebf', color: '#00aa00' },
    typeName: '\u666e\u901a',
    typeColor: '#333333',
    isPast: false,
    colStart: 2,
    colSpan: 4
});
assert.match(noteHtml, /grid-column:2 \/ span 4/);
assert.match(noteHtml, /panel-trip-detail-note-line/);
assert.match(noteHtml, /style="color:#00aa00"/);
assert.match(noteHtml, />\u5c71\u624b\u7ebf</);

const stopHtml = renderPanelTripDetailGridStopCellsSharedStation({
    stop: { stationId: 'station-a', stationName: '\u6e0b\u8c37', isPast: true, dep: '12:34' },
    timeColStart: 4,
    lineColor: '#005aaa',
    rowMarkerCol: 3,
    rowMarkerText: '||',
    stationCode: 'JY20',
    stationName: '\u6e0b\u8c37',
    renderPanelTripDetailStationCellHtml: (input) => `<station data='${JSON.stringify(input)}'></station>`,
    renderTripDetailMomentHtml: (input) => `${input.dep}`
});
assert.match(stopHtml, /grid-column:4 \/ span 2/);
assert.match(stopHtml, /panel-trip-detail-grid-flow-marker is-past/);
assert.match(stopHtml, /\|\|/);
assert.match(stopHtml, /12:34/);
assert.match(stopHtml, /JY20/);

const markerHtml = renderPanelTripDetailGridMarkerCell({
    text: '\u89e3\u7f16',
    col: 5,
    isPast: true,
    className: 'extra'
});
assert.equal(
    markerHtml,
    '<div class="panel-trip-detail-grid-break-marker is-past extra" style="grid-column:5;">\u89e3\u7f16</div>'
);

console.log('panel trip-detail grid helpers smoke ok');

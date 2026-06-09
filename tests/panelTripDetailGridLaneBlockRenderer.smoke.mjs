import assert from 'node:assert/strict';

import { renderPanelTripDetailGridLaneBlock } from '../src/features/panel/panelTripDetailGridLaneBlockRenderer.js';

const html = renderPanelTripDetailGridLaneBlock({
    descriptor: { text: '\u5c71\u624b\u7ebf', color: '#00aa00' },
    typeName: '\u666e\u901a',
    typeColor: '#333333',
    rows: [
        { stationId: 'station-a', stationName: '\u6e0b\u8c37', dep: '12:34', isPast: false },
        { stationId: 'station-b', stationName: '\u65b0\u5bbf', dep: '12:40', isPast: false }
    ],
    timeColStart: 4,
    totalCols: 5,
    lineColor: '#00aa00',
    flowMarkerCol: 3,
    rowMarkerText: '||',
    resolveStationCode: (stationId) => stationId === 'station-a' ? 'JY20' : 'JY17',
    renderPanelTripDetailStationCellHtml: (input) => `<station data='${JSON.stringify(input)}'></station>`,
    renderTripDetailMomentHtml: (input) => `${input.dep}`
});

assert.match(html, /\u5c71\u624b\u7ebf/);
assert.match(html, /grid-column:4 \/ span 2/);
assert.match(html, /\|\|/);
assert.match(html, /JY20/);
assert.match(html, /12:34/);
assert.match(html, /12:40/);

console.log('panel trip-detail grid lane block renderer smoke ok');

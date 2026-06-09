import assert from 'node:assert/strict';

import { buildPanelTripDetailTitleHtml } from '../src/features/panel/panelTripDetailTitleRenderer.js';

const html = await buildPanelTripDetailTitleHtml({
    trip: { y: 'rapid', ds: ['station-b'] },
    stationsIndex: {
        idToNameZh: new Map([['station-b', '\u6e0b\u8c37']])
    },
    trainTypesIndex: new Map([['rapid', '\u5feb\u7279']]),
    trainTypeColorIndex: new Map([['rapid', '#005aaa']]),
    resolveThroughServiceEndpointIds: async () => ({ terminalIds: [] }),
    getStationIds: (value) => Array.isArray(value) ? value : [],
    buildTerminalDisplayLabel: (names) => names.join(' / '),
    getTripDestName: () => '',
    resolveTrainTypeColorForTheme: (value) => value,
    collectTripSpecialNames: async () => ['\u76f4\u901a', '\u5feb\u7279'],
    escapeHtml: (value) => String(value)
});

assert.equal(
    html,
    '<div class="panel-trip-detail-title-main">\u5f80 \u6e0b\u8c37 <span class="panel-trip-detail-title-type" style="color:#005aaa">\u5feb\u7279</span></div><div class="panel-trip-detail-title-special">\u76f4\u901a / \u5feb\u7279</div>'
);

console.log('panel trip-detail title renderer smoke ok');

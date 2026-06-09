import assert from 'node:assert/strict';

import { buildPanelTimetableGridHtmlForDirection } from '../src/features/panel/panelTimetableGridRenderer.js';

const html = buildPanelTimetableGridHtmlForDirection({
    rowsForDir: [
        {
            timeMs: 7200000,
            serviceHourIndex: 2,
            minuteLabel: '15',
            typeName: 'Local',
            terminalDisplayName: 'Tokyo',
            terminalNames: ['Tokyo'],
            typeColor: '#123456',
            realOriginId: 'trip-1',
            specialNames: ['Special Alpha', 'Beta Two'],
            showOriginLabel: true
        }
    ],
    typeHints: [{ full: 'Local', abbr: 'L' }],
    terminalHints: [{ full: 'Tokyo', abbr: 'T' }],
    specialHints: [
        { sp: 'Special', abbr: 'S' },
        { sp: 'Beta', abbr: 'B' }
    ],
    expanded: false,
    nowMs: 7200000,
    serviceDayStartMs: 0,
    serviceDayBoundaryHour: 3,
    buildTypeAbbr: (value) => String(value || '').slice(0, 1),
    deriveSpecialSp: (value) => String(value || '').split(' ')[0],
    escapeHtml: (value) => String(value ?? ''),
    isNoMarkTypeName: () => false,
    resolveTrainTypeColorForTheme: (value) => String(value || ''),
    toText: (value) => String(value ?? '').trim()
});

assert.match(html, /panel-timetable-grid/);
assert.match(html, /data-grid-current-hour="1"/);
assert.match(html, /data-trip-key="trip-1"/);
assert.match(html, /\[S·B\]T/);
assert.match(html, /aria-label="始发站"/);
assert.match(html, />始</);
assert.match(html, />05</);

assert.equal(
    buildPanelTimetableGridHtmlForDirection({ rowsForDir: [] }),
    '<div class="panel-timetable-empty">当前无班次</div>'
);

console.log('panel timetable grid renderer smoke ok');

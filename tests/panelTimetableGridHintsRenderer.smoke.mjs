import assert from 'node:assert/strict';

import { buildPanelTimetableGridHintsHtml } from '../src/features/panel/panelTimetableGridHintsRenderer.js';

const escapeHtml = (input) => String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const toText = (value) => String(value ?? '').trim();

const html = buildPanelTimetableGridHintsHtml({
    typeHints: [
        { full: '普通', abbr: '普', color: '#666' },
        { full: '快速', abbr: '快', color: '#f00' },
        { full: 'Same', abbr: 'Same', color: '<blue>' }
    ],
    terminalHints: [
        {
            hintParts: [
                { full: 'Tokyo', abbr: 'T', noMarkMode: 'label' },
                { full: 'Ueno', abbr: 'U', noMarkMode: 'dual' }
            ]
        },
        { full: 'Ikebukuro/Shibuya', abbr: 'I/S' }
    ],
    specialHints: [
        { full: 'Special Alpha', abbr: 'S' }
    ],
    escapeHtml,
    isNoMarkTypeName: (name) => name === '普通',
    toText
});

assert.match(html, /panel-grid-hints/);
assert.match(html, /<i>无标<\/i>=普通/);
assert.match(html, /快速=快/);
assert.match(html, /Same/);
assert.match(html, /&lt;blue&gt;/);
assert.match(html, /<i>无标<\/i>-Tokyo/);
assert.doesNotMatch(html, /T-Tokyo/);
assert.match(html, /<i>无标<\/i>-Ueno/);
assert.match(html, /U-Ueno/);
assert.match(html, /I-Ikebukuro/);
assert.match(html, /S-Shibuya/);
assert.match(html, /S-Special/);
assert.match(html, /种别：/);
assert.match(html, /终点站：/);
assert.match(html, /特殊班次：/);

const emptyHtml = buildPanelTimetableGridHintsHtml({ escapeHtml, toText });
assert.match(emptyHtml, /种别：/);
assert.match(emptyHtml, /终点站：/);
assert.match(emptyHtml, />无<\/span>/);
assert.doesNotMatch(emptyHtml, /特殊班次：/);

console.log('panel timetable grid hints renderer smoke ok');

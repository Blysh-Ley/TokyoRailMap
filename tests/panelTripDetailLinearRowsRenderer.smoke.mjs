import assert from 'node:assert/strict';

import { renderPanelTripDetailLinearRows } from '../src/features/panel/panelTripDetailLinearRowsRenderer.js';

const html = renderPanelTripDetailLinearRows({
    segmentBlocks: [
        {
            descriptor: { text: 'Yamanote', color: '#00aa00' },
            typeName: 'local',
            typeColor: '#00aa00',
            segments: [
                { rows: [{ stationId: 'A', isPast: false }, { stationId: 'B', isPast: false }], typeColor: '#00aa00' }
            ]
        },
        {
            descriptor: { text: 'Keihin', color: '#005aaa' },
            typeName: 'rapid',
            typeColor: '#005aaa',
            segments: [
                { rows: [{ stationId: 'C', isPast: true }], typeColor: '#005aaa' }
            ]
        }
    ],
    hideThroughSegmentsForLoop: true,
    renderPanelTripDetailLoopMarkerRow: ({ text }) => `[loop:${text}]`,
    getPanelTripDetailSegmentFirstRow: (segment) => Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[0] : null,
    getPanelTripDetailSegmentLastRow: (segment) => Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[segment.rows.length - 1] : null,
    isPanelTripDetailBoundaryPast: (left, right) => !!(left?.isPast && right?.isPast),
    renderPanelTripDetailNoteRow: ({ descriptor, typeName, isPast }) => `[note:${descriptor?.text}:${typeName}:${isPast}]`,
    renderStopRow: ({ stationId, lineColor }) => `[stop:${stationId}:${lineColor}]`
});

assert.match(html, /^\[loop:↑环线\]/);
assert.match(html, /\[note:Yamanote:local:false\]/);
assert.match(html, /\[stop:A:#00aa00\]\[stop:B:#00aa00\]/);
assert.match(html, /\[note:Keihin:rapid:false\]/);
assert.match(html, /\[stop:C:#005aaa\]/);
assert.match(html, /\[loop:↓环线\]$/);

console.log('panel trip-detail linear rows renderer smoke ok');

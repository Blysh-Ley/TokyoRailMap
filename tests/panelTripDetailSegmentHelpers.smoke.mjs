import assert from 'node:assert/strict';

import {
    getPanelTripDetailSegmentFirstRow,
    getPanelTripDetailSegmentLastRow,
    isPanelTripDetailBoundaryPast,
    renderPanelTripDetailLoopMarkerRow,
    renderPanelTripDetailNoteRow
} from '../src/features/panel/panelTripDetailSegmentHelpers.js';

const noteHtml = renderPanelTripDetailNoteRow({
    descriptor: { text: '\u5c71\u624b\u7ebf', color: '#00aa00' },
    typeName: '\u666e\u901a',
    typeColor: '#333333',
    isPast: false,
    renderTimetableNoteRowHtml: (input) => JSON.stringify(input)
});
const noteData = JSON.parse(noteHtml);
assert.equal(noteData.rowClass, 'panel-trip-detail-note-row');
assert.equal(noteData.lineText, '\u5c71\u624b\u7ebf');
assert.equal(noteData.lineColor, '#00aa00');
assert.equal(noteData.typeText, '\u666e\u901a');

const pastNoteHtml = renderPanelTripDetailNoteRow({
    descriptor: { text: '\u5c71\u624b\u7ebf', color: '#00aa00' },
    typeName: '\u666e\u901a',
    typeColor: '#333333',
    isPast: true,
    renderTimetableNoteRowHtml: (input) => JSON.stringify(input)
});
const pastNoteData = JSON.parse(pastNoteHtml);
assert.equal(pastNoteData.rowClass, 'panel-trip-detail-note-row is-past');
assert.equal(pastNoteData.lineColor, '#ccc');
assert.equal(pastNoteData.typeColor, '');

assert.equal(getPanelTripDetailSegmentFirstRow({ rows: [{ id: 1 }, { id: 2 }] }).id, 1);
assert.equal(getPanelTripDetailSegmentLastRow({ rows: [{ id: 1 }, { id: 2 }] }).id, 2);
assert.equal(getPanelTripDetailSegmentFirstRow({ rows: [] }), null);
assert.equal(getPanelTripDetailSegmentLastRow(null), null);

assert.equal(isPanelTripDetailBoundaryPast({ isPast: true }, { isPast: true }), true);
assert.equal(isPanelTripDetailBoundaryPast({ isPast: true }, { isPast: false }), false);
assert.equal(isPanelTripDetailBoundaryPast(null, { isPast: true }), true);
assert.equal(isPanelTripDetailBoundaryPast(null, null), false);

const loopMarkerHtml = renderPanelTripDetailLoopMarkerRow({
    text: '\u2191\u73af\u7ebf',
    renderTimetablePlainNoteRowHtml: (input) => JSON.stringify(input)
});
const loopMarkerData = JSON.parse(loopMarkerHtml);
assert.equal(loopMarkerData.rowClass, 'panel-trip-detail-note-row');
assert.equal(loopMarkerData.lineClass, 'panel-trip-detail-note-line');
assert.equal(loopMarkerData.text, '\u2191\u73af\u7ebf');

console.log('panel trip-detail segment helpers smoke ok');

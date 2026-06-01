import assert from 'node:assert/strict';

import {
    buildTimetablePrintPayload,
    deriveDirectionStats,
    mergeDuplicateTimetableRows,
    normalizeTimetableAllowedTripKeys,
    normalizeTimetableSourceLineIds
} from '../src/features/panel/panelTimetableViewModel.js';

assert.deepEqual(
    normalizeTimetableSourceLineIds({
        lineId: ' L1 ',
        sourceLineIds: [' L2 ', 'L2', '', ' L3 ']
    }),
    ['L2', 'L3']
);
assert.deepEqual(normalizeTimetableSourceLineIds({ lineId: ' L1 ' }), ['L1']);

assert.deepEqual(Array.from(normalizeTimetableAllowedTripKeys([' A ', '', 'B'])), ['A', 'B']);
assert.equal(normalizeTimetableAllowedTripKeys(null), null);

const mergedRows = mergeDuplicateTimetableRows([
    {
        arr: '08:00',
        baseTripKey: 'trip-a',
        dir: 'Outbound',
        showOriginLabel: true,
        specialNames: ['Named'],
        terminalName: 'Terminal A',
        timeMs: 100,
        tripKey: 'trip-a.1'
    },
    {
        baseTripKey: 'trip-a',
        dep: '08:01',
        dir: 'Outbound',
        showTerminalLabel: true,
        terminalIds: ['T1'],
        timeMs: 100,
        tripKey: 'trip-a.2',
        typeColor: '#f00',
        typeName: 'Rapid'
    },
    {
        baseTripKey: 'trip-b',
        dep: '09:00',
        dir: 'Inbound',
        timeMs: 200,
        tripKey: 'trip-b'
    }
]);

assert.equal(mergedRows.length, 2);
assert.equal(mergedRows[0].dep, '08:01');
assert.equal(mergedRows[0].arr, '08:00');
assert.equal(mergedRows[0].typeName, 'Rapid');
assert.equal(mergedRows[0].showOriginLabel, true);
assert.equal(mergedRows[0].showTerminalLabel, true);
assert.deepEqual(mergedRows[0].specialNames, ['Named']);
assert.deepEqual(mergedRows[0].terminalIds, ['T1']);

const stats = deriveDirectionStats({
    rows: [
        { dir: 'A', destNamesForDir: ['X', 'X'] },
        { dir: 'B', destNamesForDir: ['Y'] },
        { dir: 'A', destNamesForDir: ['X'] }
    ]
});
assert.deepEqual(stats.dirOrder, ['A', 'B']);
assert.equal(stats.dirToDestCounts.get('A').get('X'), 3);
assert.equal(stats.anyDestAboveThreshold, true);

const printPayload = buildTimetablePrintPayload({
    companyLogoMap: {
        C1: { type: 'railway', zh: 'Company 1' }
    },
    currentStationName: '',
    dirKey: 'Outbound',
    dirLabel: 'Terminal',
    getCompanyLogoSrc: (companyKey) => `logo:${companyKey}`,
    gridHintsHtml: '<div>hints</div>',
    gridHtml: '<div>grid</div>',
    lineId: 'L1',
    lineMeta: { color: '#123456', company: 'C1', name: 'Line 1' },
    listHtml: '<div>list</div>',
    serviceDay: 'Weekday',
    timetableViewMode: 'grid',
    titleText: 'Tokyo'
});

assert.equal(printPayload.stationName, 'Tokyo');
assert.equal(printPayload.lineName, 'Line 1');
assert.equal(printPayload.lineColor, '#123456');
assert.equal(printPayload.companyName, 'Company 1');
assert.equal(printPayload.companyType, 'railway');
assert.equal(printPayload.companyLogoSrc, 'logo:C1');
assert.equal(printPayload.dirLabel, 'Terminal');
assert.equal(printPayload.timetableViewMode, 'grid');

console.log('panel timetable view model smoke ok');

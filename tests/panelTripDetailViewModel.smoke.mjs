import assert from 'node:assert/strict';

import {
    applyTripDetailPastState,
    buildTripDetailEndpointContext,
    buildTripDetailTitleViewModel,
    markRowsPastByStation,
    mergeTripDetailSegmentsAtBoundaries
} from '../src/features/panel/panelTripDetailViewModel.js';

const endpoint = buildTripDetailEndpointContext({
    trip: {
        d: 'InnerLoop',
        ds: ['T1'],
        nt: ['N1'],
        os: ['O1'],
        pt: ['P1']
    },
    getStationAKey: (id) => id.replace(/\d+$/, '')
});

assert.equal(endpoint.hideThroughSegmentsForLoop, true);
assert.equal(endpoint.hasNt, true);
assert.equal(endpoint.hasPt, true);
assert.deepEqual(endpoint.ptRefIds, ['P1']);
assert.deepEqual(endpoint.ntRefIds, ['N1']);
assert.equal(endpoint.originIds.has('O1'), true);
assert.equal(endpoint.terminalIds.has('T1'), true);
assert.equal(endpoint.originAKeys.has('O'), true);
assert.equal(endpoint.terminalAKeys.has('T'), true);
assert.equal(endpoint.showOriginLabel, true);
assert.equal(endpoint.showTerminalLabel, true);

const merged = mergeTripDetailSegmentsAtBoundaries({
    getStationAKey: (id) => ({ S1A: 'S1', S1B: 'S1' }[id] || id),
    segments: [
        {
            kind: 'pt',
            rows: [
                { stationId: 'P0', dep: '08:00', stationName: 'Prev' },
                { arr: '08:10', arrPlus: true, stationId: 'S1A', stationName: 'Shared A' }
            ]
        },
        {
            kind: 'main',
            rows: [
                { dep: '08:12', stationId: 'S1B', stationName: 'Shared B' },
                { stationId: 'M1', dep: '08:30' }
            ]
        }
    ]
});

assert.equal(merged[0].rows.length, 1);
assert.equal(merged[1].rows[0].stationId, 'S1B');
assert.equal(merged[1].rows[0].arr, '08:10');
assert.equal(merged[1].rows[0].arrPlus, true);
assert.equal(merged[1].rows[0].dep, '08:12');

const past = applyTripDetailPastState({
    currentStationId: 'B',
    segments: [
        { kind: 'main', rows: [{ stationId: 'A', isMain: true }, { stationId: 'B', isMain: true }] },
        { kind: 'nt', rows: [{ stationId: 'C', isMain: false }] }
    ]
});
assert.deepEqual(past.segmentsWithPast.map((seg) => seg.rows.map((row) => row.isPast)), [
    [true, false],
    [false]
]);

assert.deepEqual(markRowsPastByStation({
    currentStationId: 'Y',
    rows: [{ stationId: 'X' }, { stationId: 'Y' }]
}).map((row) => row.isPast), [true, false]);
assert.deepEqual(markRowsPastByStation({
    currentStationId: 'missing',
    fallbackPast: true,
    rows: [{ stationId: 'X' }]
}).map((row) => row.isPast), [true]);

const title = buildTripDetailTitleViewModel({
    buildTerminalDisplayLabel: (names) => names.join(' / '),
    resolveTrainTypeColorForTheme: (color) => `theme:${color}`,
    stationNameById: new Map([['T1', 'Terminal']]),
    terminalIds: ['T1'],
    trainTypeColorIndex: new Map([['rapid', '#f00']]),
    trainTypesIndex: new Map([['rapid', 'Rapid']]),
    trip: { y: 'rapid' }
});
assert.equal(title.destName, 'Terminal');
assert.equal(title.typeName, 'Rapid');
assert.equal(title.typeColor, 'theme:#f00');
assert.equal(title.titlePrefix, '寰€ Terminal');

console.log('panel trip detail view model smoke ok');

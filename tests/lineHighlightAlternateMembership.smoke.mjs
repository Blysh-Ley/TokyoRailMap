import assert from 'node:assert/strict';

import {
    buildAlternateLineHighlightSegments,
    buildLineHighlightStationSegments,
    buildLineHighlightVirtualTripPayloads
} from '../src/domain/lineHighlightVirtualTripBuilder.js';

const alternateLineMembership = {
    highlightHiddenIdsByLineId: new Map([
        ['PARTIAL', new Set(['A', 'B'])],
        ['INTERNAL', new Set(['B', 'C'])],
        ['FULL', new Set(['F1', 'F2'])]
    ]),
    highlightAlternateLineIdByLineStationId: new Map([
        ['PARTIAL\u0000A', 'ALT'],
        ['PARTIAL\u0000B', 'ALT']
    ])
};

assert.deepEqual(
    buildLineHighlightStationSegments({
        lineId: 'PARTIAL',
        stationIds: ['A', 'B', 'C', 'D'],
        alternateLineMembership
    }).map((segment) => segment.stationIds),
    [['B', 'C', 'D']],
    'boundary station must stay as the start of the remaining real line highlight'
);

assert.deepEqual(
    buildLineHighlightStationSegments({
        lineId: 'INTERNAL',
        stationIds: ['A', 'B', 'C', 'D'],
        alternateLineMembership
    }).map((segment) => segment.stationIds),
    [['A', 'B'], ['C', 'D']],
    'internal borrowed geometry must split the base line into separate highlight segments'
);

assert.deepEqual(
    buildAlternateLineHighlightSegments({
        lineId: 'PARTIAL',
        stationIds: ['A', 'B', 'C'],
        alternateLineMembership
    }),
    [{
        kind: 'alternate',
        lineId: 'ALT',
        r: 'ALT',
        geometryLineId: 'ALT',
        offsetLineId: 'ALT',
        stationIds: ['A', 'B']
    }],
    'suppressed highlight pairs should be representable with alternate line identity'
);

assert.deepEqual(buildLineHighlightVirtualTripPayloads({
    lineIds: ['PARTIAL', 'FULL'],
    railwaysIndexById: new Map([
        ['PARTIAL', { stations: ['A', 'B', 'C'] }],
        ['FULL', { stations: ['F1', 'F2'] }]
    ]),
    alternateLineMembership
}).map((payload) => payload.selectedLineId), ['PARTIAL']);

console.log('line highlight alternate membership smoke ok');

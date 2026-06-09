import assert from 'node:assert/strict';

import { buildPanelTripPreviewScheduleArgs } from '../src/features/panel/panelTripDetailPreviewPayloadBuilder.js';

const baseArgs = buildPanelTripPreviewScheduleArgs({
    trip: { d: 'Outbound', r: 'JR.Main' },
    tripKey: 'trip-1',
    lineId: 'JR.Main',
    typeName: 'Local',
    typeColor: '#123456',
    hasNt: true,
    fitMode: 'selected',
    throughCategoryColor: '',
    throughCategoryLabel: '',
    segmentsWithPast: [
        {
            kind: 'main',
            lineId: 'JR.Main',
            r: 'JR.Main',
            rows: [
                { stationId: 'S1' },
                { stationId: 'S2' },
                { stationId: 'S3' }
            ]
        }
    ],
    activeBranchLanes: [],
    branchMode: '',
    pinned: false,
    tripLocked: true,
    getTripLineId: (trip) => trip.r,
    getLineMeta: (lineId) => ({ name: `${lineId} name` })
});

assert.equal(baseArgs.previewKey, 'JR.Main||trip-1');
assert.equal(baseArgs.immediate, true);
assert.equal(baseArgs.payload.mainLineId, 'JR.Main');
assert.equal(baseArgs.payload.selectedLineName, 'JR.Main name');
assert.deepEqual(baseArgs.payload.chainLineIds, ['JR.Main']);
assert.equal(Array.isArray(baseArgs.payload.virtualTimetable), true);
assert.ok(baseArgs.payload.virtualTimetable.length >= 1);

const splitArgs = buildPanelTripPreviewScheduleArgs({
    trip: { d: 'Outbound', r: 'JR.Main' },
    tripKey: 'trip-2',
    lineId: 'JR.Main',
    typeName: 'Rapid',
    typeColor: '#654321',
    hasNt: true,
    fitMode: 'selected',
    throughCategoryColor: '',
    throughCategoryLabel: '',
    segmentsWithPast: [
        {
            kind: 'main',
            lineId: 'JR.Main',
            r: 'JR.Main',
            rows: [
                { stationId: 'M1' },
                { stationId: 'M2' }
            ]
        },
        {
            kind: 'nt',
            lineId: 'JR.BranchA',
            r: 'JR.BranchA',
            rows: [
                { stationId: 'A2' },
                { stationId: 'A3' }
            ]
        }
    ],
    activeBranchLanes: [
        {
            lineId: 'JR.BranchA',
            d: 'Outbound',
            typeColor: '#aa0000',
            rows: [
                { stationId: 'A2' },
                { stationId: 'A3' }
            ]
        },
        {
            lineId: 'JR.BranchB',
            d: 'Outbound',
            typeColor: '#00aa00',
            rows: [
                { stationId: 'B2' },
                { stationId: 'B3' }
            ]
        }
    ],
    branchMode: 'split',
    pinned: false,
    tripLocked: false,
    getTripLineId: (trip) => trip.r,
    getLineMeta: (lineId) => ({ name: `${lineId} name` })
});

assert.equal(Array.isArray(splitArgs.payload.virtualTrips), true);
assert.equal(splitArgs.payload.virtualTrips.length, 2);
assert.equal(splitArgs.payload.virtualTrips[0].hasNt, true);
assert.deepEqual(
    splitArgs.payload.virtualTrips[0].chainLineIds,
    ['JR.Main', 'JR.BranchA']
);
assert.deepEqual(
    splitArgs.payload.virtualTrips[1].chainLineIds,
    ['JR.Main', 'JR.BranchB']
);

console.log('panel trip detail preview payload builder smoke ok');

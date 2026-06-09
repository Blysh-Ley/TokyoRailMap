import assert from 'node:assert/strict';

import { preparePanelTripDetailBranchMainFlow } from '../src/features/panel/panelTripDetailBranchMainFlow.js';

const descriptorByLineId = new Map([
    ['main-line', { id: 'main-line', color: '#123456' }]
]);

const result = preparePanelTripDetailBranchMainFlow({
    activeBranchLanes: [
        { lineId: 'branch-b', rows: [{ id: 'b' }] },
        { lineId: 'main-line', rows: [{ id: 'a' }] },
        { lineId: 'branch-c', rows: [{ id: 'c' }] }
    ],
    buildLineDescriptor: (lineId) => descriptorByLineId.get(lineId) || null,
    currentLineDesc: null,
    fallbackLineId: 'fallback-line',
    pickPrimaryLaneIndex: (lanes, mainLineId) => lanes.findIndex((lane) => lane?.lineId === mainLineId),
    segmentsWithPast: [
        { kind: 'branch', rows: [{ id: 'branch' }] },
        { kind: 'main', rows: [{ id: 'main-row' }] }
    ],
    tripLineId: 'main-line'
});

assert.deepEqual(result.mainRows, [{ id: 'main-row' }]);
assert.deepEqual(result.mainDescriptor, { id: 'main-line', color: '#123456' });
assert.deepEqual(result.primaryLane, { lineId: 'main-line', rows: [{ id: 'a' }] });
assert.deepEqual(result.secondaryLanes, [
    { lineId: 'branch-b', rows: [{ id: 'b' }] },
    { lineId: 'branch-c', rows: [{ id: 'c' }] }
]);

const fallbackResult = preparePanelTripDetailBranchMainFlow({
    activeBranchLanes: [],
    buildLineDescriptor: (lineId) => ({ id: lineId }),
    fallbackLineId: 'fallback-line',
    segmentsWithPast: [],
    tripLineId: ''
});

assert.deepEqual(fallbackResult.mainRows, []);
assert.deepEqual(fallbackResult.mainDescriptor, { id: 'fallback-line' });
assert.equal(fallbackResult.primaryLane, null);
assert.deepEqual(fallbackResult.secondaryLanes, []);

console.log('panel trip-detail branch main-flow smoke ok');

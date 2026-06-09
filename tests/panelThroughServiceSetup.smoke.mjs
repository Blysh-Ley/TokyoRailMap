import assert from 'node:assert/strict';

import {
    applyTemporarySourceLineOverrides,
    createEmptyPanelThroughServiceState,
    resolvePanelThroughServiceSetup
} from '../src/features/panel/panelThroughServiceSetup.js';

const emptyState = createEmptyPanelThroughServiceState();
assert.equal(emptyState.temporaryLineMetaById.size, 0);
assert.equal(emptyState.temporarySourceLineIdsByDisplayLineId.size, 0);
assert.equal(emptyState.temporaryAllowedTripKeysByDisplayLineId.size, 0);

const unchangedState = resolvePanelThroughServiceSetup({
    throughPlan: null,
    displayServingIds: ['JR.Main']
});
assert.deepEqual(unchangedState.displayServingIds, ['JR.Main']);
assert.equal(unchangedState.temporaryLineMetaById.size, 0);

const throughPlan = {
    displayServingIds: ['JR.Main', 'JR.Main.Temp'],
    temporaryLineMetaById: new Map([['JR.Main.Temp', { title: 'Temp' }]]),
    temporarySourceLineIdsByDisplayLineId: new Map([['JR.Main.Temp', ['JR.Main', 'JR.Main.Branch', '']]]),
    temporaryAllowedTripKeysByDisplayLineId: new Map([['JR.Main.Temp', new Set(['trip-1'])]])
};

const resolvedState = resolvePanelThroughServiceSetup({
    throughPlan,
    displayServingIds: ['JR.Main']
});
assert.deepEqual(resolvedState.displayServingIds, ['JR.Main', 'JR.Main.Temp']);
assert.deepEqual(resolvedState.temporaryLineMetaById.get('JR.Main.Temp'), { title: 'Temp' });
assert.equal(resolvedState.temporaryAllowedTripKeysByDisplayLineId.get('JR.Main.Temp').has('trip-1'), true);

const mergedGroups = applyTemporarySourceLineOverrides({
    lineGroupByMainId: new Map([['JR.Main', ['JR.Main']]]),
    temporarySourceLineIdsByDisplayLineId: resolvedState.temporarySourceLineIdsByDisplayLineId
});
assert.deepEqual(mergedGroups.get('JR.Main'), ['JR.Main']);
assert.deepEqual(mergedGroups.get('JR.Main.Temp'), ['JR.Main', 'JR.Main.Branch']);

console.log('panel through-service setup smoke ok');

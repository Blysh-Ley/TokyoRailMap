import assert from 'node:assert/strict';

import {
    preparePanelStationRenderBootstrap,
    resetPanelStationRenderTransientState
} from '../src/features/panel/panelStationRenderBootstrap.js';

const resetEvents = [];
const dirPrintPayloadByKey = new Map([['a', 1]]);
const dirFilterStateByKey = new Map([['b', 2]]);

const resetState = resetPanelStationRenderTransientState({
    dirPrintPayloadByKey,
    dirFilterStateByKey,
    clearHoverTimer: () => resetEvents.push('hover'),
    clearRestoreTimer: () => resetEvents.push('restore'),
    clearTripHighlightTimer: () => resetEvents.push('trip'),
    hideTripDetail: () => resetEvents.push('hide'),
    closeDirFilterPopover: () => resetEvents.push('popover'),
    clearPinnedPanelState: ({ restoreStation }) => resetEvents.push(`pin:${restoreStation}`)
});

assert.deepEqual(resetEvents, ['hover', 'restore', 'trip', 'hide', 'popover', 'pin:false']);
assert.equal(dirPrintPayloadByKey.size, 0);
assert.equal(dirFilterStateByKey.size, 0);
assert.equal(resetState.pendingGridDataDebugLog, true);
assert.deepEqual(Array.from(resetState.expandedDirKeys), []);
assert.equal(resetState.lastAppliedHoverKey, null);
assert.equal(resetState.lastMousePrimaryKey, '');
assert.equal(resetState.lastTripDetailKey, null);

const bootstrap = preparePanelStationRenderBootstrap({
    props: { serving_ids: '["JR.Main","JR.Main.Branch",""]' },
    normalizeArrayLike: (value) => JSON.parse(value),
    buildPanelLineMergeInfo: ({ servingLineIds }) => ({
        displayLineIds: servingLineIds.slice(0, 1),
        lineGroupByMainId: new Map([['JR.Main', servingLineIds]])
    }),
    createEmptyPanelThroughServiceState: () => ({
        temporaryLineMetaById: new Map(),
        temporarySourceLineIdsByDisplayLineId: new Map(),
        temporaryAllowedTripKeysByDisplayLineId: new Map()
    })
});

assert.deepEqual(bootstrap.currentStationServingIds, ['JR.Main', 'JR.Main.Branch']);
assert.deepEqual(bootstrap.displayServingIds, ['JR.Main']);
assert.deepEqual(bootstrap.mergeInfo.lineGroupByMainId.get('JR.Main'), ['JR.Main', 'JR.Main.Branch']);
assert.equal(bootstrap.throughServiceState.temporaryLineMetaById.size, 0);

console.log('panel station render bootstrap smoke ok');

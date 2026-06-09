import assert from 'node:assert/strict';

import { createPanelPinnedTripDetailState } from '../src/features/panel/panelPinnedTripDetailState.js';

let tripLocked = false;
let lockedTripKey = null;
let tripDetailPinned = false;
let lastTripDetailKey = 'trip:old';
let lastAppliedHoverKey = 'line:old';
let hideCount = 0;
let clearHideCount = 0;
let scheduledHide = null;
let clearedPinnedDir = 0;
let restoredSelection = 0;

const panelSelectionState = {
    getCurrentPinnedInteractionKey: ({ tripLocked, lockedTripKey }) => tripLocked && lockedTripKey ? lockedTripKey : '',
    clearPinnedPanelSelection: () => {},
    getPinnedDirPreviewKey: () => 'dir:key'
};

const body = {
    classList: {
        remove: () => {}
    }
};

const runtime = createPanelPinnedTripDetailState({
    clearTripDetailHideTimer: () => {
        clearHideCount += 1;
    },
    scheduleTripDetailHideTimer: (callback) => {
        scheduledHide = callback;
    },
    hideTripDetail: () => {
        hideCount += 1;
    },
    panelSelectionState,
    body,
    clearPinnedDirPreview: () => {
        clearedPinnedDir += 1;
    },
    restoreStationDefaultSelection: () => {
        restoredSelection += 1;
    },
    getTripLocked: () => tripLocked,
    setTripLocked: (value) => {
        tripLocked = value;
    },
    getLockedTripKey: () => lockedTripKey,
    setLockedTripKey: (value) => {
        lockedTripKey = value;
    },
    getTripDetailPinned: () => tripDetailPinned,
    setTripDetailPinned: (value) => {
        tripDetailPinned = value;
    },
    setLastTripDetailKey: (value) => {
        lastTripDetailKey = value;
    },
    setLastAppliedHoverKey: (value) => {
        lastAppliedHoverKey = value;
    }
});

runtime.lockTripPreview('trip:new');
assert.equal(tripLocked, true);
assert.equal(lockedTripKey, 'trip:new');
assert.equal(tripDetailPinned, true);

runtime.unlockTripPreview();
assert.equal(tripLocked, false);
assert.equal(lockedTripKey, null);
assert.equal(tripDetailPinned, false);

runtime.scheduleTripDetailHide();
assert.equal(clearHideCount > 0, true);
scheduledHide?.();
assert.equal(hideCount, 1);
assert.equal(lastTripDetailKey, null);

tripLocked = true;
lockedTripKey = 'trip:pin';
tripDetailPinned = true;
lastTripDetailKey = 'trip:pin';
const hadPinned = runtime.clearPinnedPanelState();
assert.equal(hadPinned, true);
assert.equal(hideCount, 2);
assert.equal(lastTripDetailKey, null);
assert.equal(clearedPinnedDir, 1);
assert.equal(restoredSelection, 1);
assert.equal(lastAppliedHoverKey, null);

console.log('panel pinned trip-detail state smoke ok');

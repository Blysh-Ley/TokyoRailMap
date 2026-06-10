import assert from 'node:assert/strict';

import {
    createPanelDismissController,
    createPanelInteractionPolicy
} from '../src/features/panel/panelInteractionCore.js';

const calls = [];
const outsideTarget = { id: 'outside' };
const panelShell = {
    getClickRegion(target) {
        return {
            ignored: false,
            insideExtra: false,
            insidePanel: target?.id === 'inside-panel',
            insidePanelOrExtra: target?.id === 'inside-panel'
        };
    }
};

const dismissController = createPanelDismissController({
    clearPinnedDirPreview: () => calls.push('clear-dir'),
    clearPinnedPanelState: () => calls.push('clear-panel'),
    findTripTarget: () => null,
    getTripDetailPinned: () => true,
    getTripLocked: () => false,
    hasPinnedPanelState: () => false,
    hideTripDetail: () => calls.push('hide-trip'),
    panelSelectionState: {
        getPinnedDirPreviewKey: () => 'dir:1'
    },
    panelShell,
    setLastTripDetailKey: (value) => calls.push(`last:${value}`),
    tripDetailRoot: {
        contains: () => false
    }
});

dismissController.handleDocumentClick({ target: outsideTarget });
assert.deepEqual(calls, ['clear-dir', 'hide-trip', 'last:null']);

let lastPointerTouchLike = false;
let suppressMouseHover = false;
const policy = createPanelInteractionPolicy({
    getPresentation: () => 'desktop',
    touchInteraction: {
        isLastPointerTouchLike: () => lastPointerTouchLike,
        shouldSuppressMouseHover: () => suppressMouseHover
    }
});

assert.equal(policy.shouldSkipDesktopHover(), false);
lastPointerTouchLike = true;
assert.equal(policy.shouldSkipDesktopHover(), true);
suppressMouseHover = true;
assert.equal(policy.shouldSuppressMouseHover(), true);

const mobilePolicy = createPanelInteractionPolicy({
    getPresentation: () => 'mobile',
    touchInteraction: {
        isLastPointerTouchLike: () => false
    }
});
assert.equal(mobilePolicy.shouldSkipDesktopHover(), true);

console.log('panel interaction policy smoke ok');

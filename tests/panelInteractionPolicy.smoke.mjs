import assert from 'node:assert/strict';

import {
    createPanelTouchInteractionController,
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
    clearPinnedPanelState: () => calls.push('clear-panel'),
    findTripTarget: () => null,
    getTripDetailPinned: () => true,
    getTripLocked: () => false,
    hasPinnedPanelState: () => false,
    hideTripDetail: () => calls.push('hide-trip'),
    panelShell,
    setLastTripDetailKey: (value) => calls.push(`last:${value}`),
    tripDetailRoot: {
        contains: () => false
    }
});

dismissController.handleDocumentClick({ target: outsideTarget });
assert.deepEqual(calls, ['hide-trip', 'last:null']);

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

let clockMs = 0;
const touchController = createPanelTouchInteractionController({
    maxMovePx: 12,
    now: () => clockMs
});
touchController.beginPointer({
    pointerType: 'touch',
    pointerId: 7,
    clientX: 10,
    clientY: 20
});
touchController.startTripTap({
    pointerType: 'touch',
    pointerId: 7,
    clientX: 10,
    clientY: 20
}, {
    kind: 'dir-title-toggle',
    lineId: 'L1',
    dirKey: 'D1'
});
touchController.moveTripTap({
    pointerType: 'touch',
    pointerId: 7,
    clientX: 30,
    clientY: 20
});
const movedDirTitleTap = touchController.finishTripTap({
    pointerType: 'touch',
    pointerId: 7,
    clientX: 30,
    clientY: 20
});
assert.equal(movedDirTitleTap.handled, true);
assert.equal(movedDirTitleTap.moved, true);
assert.equal(movedDirTitleTap.eligible, false);
assert.equal(movedDirTitleTap.tap.kind, 'dir-title-toggle');

clockMs = 100;
touchController.beginPointer({
    pointerType: 'touch',
    pointerId: 8,
    clientX: 40,
    clientY: 50
});
touchController.startTripTap({
    pointerType: 'touch',
    pointerId: 8,
    clientX: 40,
    clientY: 50
}, {
    kind: 'dir-filter',
    lineId: 'L1',
    dirKey: 'D1',
    buttonEl: { id: 'filter-button' }
});
clockMs = 180;
const filterTap = touchController.finishTripTap({
    pointerType: 'touch',
    pointerId: 8,
    clientX: 41,
    clientY: 51
});
assert.equal(filterTap.handled, true);
assert.equal(filterTap.eligible, true);
assert.equal(filterTap.tap.kind, 'dir-filter');
assert.equal(filterTap.tap.buttonEl.id, 'filter-button');

clockMs = 190;
touchController.beginPointer({
    pointerType: 'touch',
    pointerId: 18,
    clientX: 12,
    clientY: 14
});
touchController.startTripTap({
    pointerType: 'touch',
    pointerId: 18,
    clientX: 12,
    clientY: 14
}, {
    kind: 'company-toggle',
    companyEl: { id: 'company' }
});
clockMs = 220;
const companyTap = touchController.finishTripTap({
    pointerType: 'touch',
    pointerId: 18,
    clientX: 13,
    clientY: 15
});
assert.equal(companyTap.handled, true);
assert.equal(companyTap.eligible, true);
assert.equal(companyTap.tap.kind, 'company-toggle');
assert.equal(companyTap.tap.companyEl.id, 'company');

clockMs = 200;
touchController.beginPointer({
    pointerType: 'touch',
    pointerId: 9,
    clientX: 40,
    clientY: 50
});
touchController.startTripTap({
    pointerType: 'touch',
    pointerId: 9,
    clientX: 40,
    clientY: 50
}, {
    kind: 'dir-filter',
    lineId: 'L1',
    dirKey: 'D1'
});
touchController.moveTripTap({
    pointerType: 'touch',
    pointerId: 9,
    clientX: 40,
    clientY: 72
});
clockMs = 240;
const movedFilterTap = touchController.finishTripTap({
    pointerType: 'touch',
    pointerId: 9,
    clientX: 40,
    clientY: 72
});
assert.equal(movedFilterTap.handled, true);
assert.equal(movedFilterTap.eligible, false);
assert.equal(movedFilterTap.moved, true);

clockMs = 260;
touchController.beginPointer({
    pointerType: 'touch',
    pointerId: 10,
    clientX: 40,
    clientY: 50
});
touchController.startTripTap({
    pointerType: 'touch',
    pointerId: 10,
    clientX: 40,
    clientY: 50
}, {
    kind: 'dir-filter',
    lineId: 'L1',
    dirKey: 'D1'
});
touchController.cancelTripTap();
const cancelledFilterTap = touchController.finishTripTap({
    pointerType: 'touch',
    pointerId: 10,
    clientX: 40,
    clientY: 50
});
assert.equal(cancelledFilterTap.handled, false);

console.log('panel interaction policy smoke ok');

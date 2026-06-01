import assert from 'node:assert/strict';

import {
    createPanelTouchInteractionController,
    isTouchLikePointer,
    readPointerType
} from '../src/features/panel/panelTouchInteractionController.js';

let currentMs = 1000;
const controller = createPanelTouchInteractionController({
    now: () => currentMs,
    maxMovePx: 12
});

assert.equal(readPointerType({ pointerType: 'pen' }), 'pen');
assert.equal(readPointerType({ type: 'touchstart' }), 'touch');
assert.equal(readPointerType({ type: 'click' }), 'mouse');
assert.equal(isTouchLikePointer('touch'), true);
assert.equal(isTouchLikePointer('pen'), true);
assert.equal(isTouchLikePointer('mouse'), false);

const touchStart = {
    pointerId: 7,
    pointerType: 'touch',
    clientX: 10,
    clientY: 20
};

assert.deepEqual(controller.beginPointer(touchStart), {
    isTouchLike: true,
    pointerType: 'touch'
});
assert.equal(controller.isLastPointerTouchLike(), true);
assert.equal(controller.shouldSuppressMouseEvents(), true);

controller.startTripTap(touchStart, {
    lineId: 'line-a',
    tripKey: 'trip-1'
});
assert.equal(controller.hasPendingTripTap(), true);

assert.equal(controller.moveTripTap({
    pointerId: 7,
    pointerType: 'touch',
    clientX: 14,
    clientY: 25
}).handled, true);

const completed = controller.finishTripTap({
    pointerId: 7,
    pointerType: 'touch',
    clientX: 14,
    clientY: 25
});
assert.equal(completed.handled, true);
assert.equal(completed.moved, false);
assert.equal(completed.clientX, 14);
assert.equal(completed.clientY, 25);
assert.equal(completed.tap.lineId, 'line-a');
assert.equal(completed.tap.tripKey, 'trip-1');
assert.equal(controller.hasPendingTripTap(), false);

controller.startTripTap({
    pointerId: 8,
    pointerType: 'touch',
    clientX: 0,
    clientY: 0
}, {
    lineId: 'line-b',
    tripKey: 'trip-2'
});
controller.moveTripTap({
    pointerId: 8,
    pointerType: 'touch',
    clientX: 20,
    clientY: 0
});
assert.equal(controller.finishTripTap({
    pointerId: 8,
    pointerType: 'touch',
    clientX: 20,
    clientY: 0
}).moved, true);

controller.armCancelInteractionSuppression();
assert.equal(controller.shouldSuppressMouseClick(), true);
assert.equal(controller.shouldSuppressMouseHover(), true);
currentMs += 1200;
assert.equal(controller.shouldSuppressMouseClick(), false);
assert.equal(controller.shouldSuppressMouseHover(), false);
assert.equal(controller.shouldSuppressMouseEvents(), false);

console.log('panel touch interaction controller smoke ok');

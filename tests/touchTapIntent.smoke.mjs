import assert from 'node:assert/strict';

import {
    createTouchTapIntentTracker,
    isTouchLikePointer,
    readPointerType
} from '../src/ui/touchTapIntent.js';

let clockMs = 0;
const tracker = createTouchTapIntentTracker({
    maxDurationMs: 500,
    maxMovePx: 12,
    now: () => clockMs
});

assert.equal(readPointerType({ pointerType: 'touch' }), 'touch');
assert.equal(readPointerType({ type: 'touchstart' }), 'touch');
assert.equal(readPointerType({ type: 'click' }), 'mouse');
assert.equal(isTouchLikePointer('touch'), true);
assert.equal(isTouchLikePointer('pen'), true);
assert.equal(isTouchLikePointer('mouse'), false);

assert.equal(tracker.begin({
    pointerType: 'mouse',
    pointerId: 1,
    clientX: 0,
    clientY: 0
}).handled, false);

clockMs = 0;
tracker.begin({
    pointerType: 'touch',
    pointerId: 7,
    clientX: 10,
    clientY: 20
}, { kind: 'filter' });
clockMs = 120;
let result = tracker.finish({
    pointerType: 'touch',
    pointerId: 7,
    clientX: 13,
    clientY: 23
});
assert.equal(result.handled, true);
assert.equal(result.eligible, true);
assert.equal(result.payload.kind, 'filter');

clockMs = 0;
tracker.begin({
    pointerType: 'touch',
    pointerId: 8,
    clientX: 10,
    clientY: 20
});
tracker.move({
    pointerType: 'touch',
    pointerId: 8,
    clientX: 30,
    clientY: 20
});
clockMs = 80;
result = tracker.finish({
    pointerType: 'touch',
    pointerId: 8,
    clientX: 30,
    clientY: 20
});
assert.equal(result.eligible, false);
assert.equal(result.moved, true);

clockMs = 0;
tracker.begin({
    pointerType: 'touch',
    pointerId: 9,
    clientX: 0,
    clientY: 0
});
clockMs = 600;
result = tracker.finish({
    pointerType: 'touch',
    pointerId: 9,
    clientX: 0,
    clientY: 0
});
assert.equal(result.eligible, false);
assert.equal(result.expired, true);

clockMs = 0;
tracker.begin({
    pointerType: 'touch',
    pointerId: 10,
    clientX: 0,
    clientY: 0
});
tracker.markMultiTouch();
clockMs = 100;
result = tracker.finish({
    pointerType: 'touch',
    pointerId: 10,
    clientX: 0,
    clientY: 0
});
assert.equal(result.eligible, false);
assert.equal(result.multiTouch, true);

console.log('touch tap intent smoke ok');

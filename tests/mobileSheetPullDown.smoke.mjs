import assert from 'node:assert/strict';

import { createMobileSheetPullDownController } from '../src/ui/mobileSheetPullDown.js';

const createTarget = () => {
    const listeners = new Map();
    return {
        scrollTop: 0,
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        removeEventListener() {},
        fire(type, event) {
            for (const handler of listeners.get(type) || []) handler(event);
        }
    };
};

const createEvent = ({
    pointerId = 1,
    clientX = 0,
    clientY = 0,
    button = 0,
    timeStamp = 0
} = {}) => {
    const event = {
        pointerId,
        clientX,
        clientY,
        button,
        timeStamp,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
            this.propagationStopped = true;
        }
    };
    return event;
};

const createTouchEvent = ({
    identifier = 1,
    clientX = 0,
    clientY = 0,
    timeStamp = 0,
    ended = false
} = {}) => {
    const touch = { identifier, clientX, clientY };
    const event = createEvent({ pointerId: identifier, clientX, clientY, timeStamp });
    event.touches = ended ? [] : [touch];
    event.changedTouches = [touch];
    return event;
};

const runGesture = ({
    startScrollTop = 0,
    moveScrollTop = startScrollTop,
    startY = 100,
    moveY = 120,
    finish = 'pointerup'
} = {}) => {
    const scrollEl = createTarget();
    const doc = createTarget();
    const calls = [];
    scrollEl.scrollTop = startScrollTop;
    createMobileSheetPullDownController({
        scrollEl,
        doc,
        beginSheetDrag: () => {
            calls.push('begin');
            return true;
        },
        updateSheetDrag: () => calls.push('update'),
        endSheetDrag: (_event, { cancelled = false } = {}) => calls.push(cancelled ? 'end:cancelled' : 'end')
    });

    scrollEl.fire('pointerdown', createEvent({ clientY: startY, timeStamp: 0 }));
    scrollEl.scrollTop = moveScrollTop;
    const moveEvent = createEvent({ clientY: moveY, timeStamp: 40 });
    doc.fire('pointermove', moveEvent);
    const finishEvent = createEvent({ clientY: moveY, timeStamp: 80 });
    doc.fire(finish, finishEvent);
    return { calls, moveEvent, finishEvent };
};

assert.deepEqual(
    runGesture({ startScrollTop: 24, moveScrollTop: 24, moveY: 140 }).calls,
    [],
    'content pull-down must not arm when the gesture starts below the top'
);

assert.deepEqual(
    runGesture({ startScrollTop: 24, moveScrollTop: 0, moveY: 140 }).calls,
    [],
    'content pull-down must not take over after the same gesture scrolls to the top'
);

assert.deepEqual(
    runGesture({ startScrollTop: 0, moveY: 80 }).calls,
    [],
    'content pull-down must not trigger on upward gestures'
);

const active = runGesture({ startScrollTop: 0, moveY: 126 });
assert.deepEqual(active.calls, ['begin', 'update', 'end']);
assert.equal(active.moveEvent.defaultPrevented, true);
assert.equal(active.moveEvent.propagationStopped, true);

assert.deepEqual(
    runGesture({ startScrollTop: 0, moveY: 126, finish: 'pointercancel' }).calls,
    ['begin', 'update', 'end:cancelled'],
    'cancelled content pull-down must restore through the sheet drag cancellation path'
);

{
    const scrollEl = createTarget();
    const doc = createTarget();
    const calls = [];
    createMobileSheetPullDownController({
        scrollEl,
        doc,
        beginSheetDrag: (event) => {
            calls.push(`begin:${event.clientY}`);
            return true;
        },
        updateSheetDrag: (event) => calls.push(`update:${event.clientY}`),
        endSheetDrag: (event) => calls.push(`end:${event.clientY}`)
    });
    scrollEl.fire('touchstart', createTouchEvent({ clientY: 100, timeStamp: 0 }));
    const earlyMove = createTouchEvent({ clientY: 104, timeStamp: 16 });
    doc.fire('touchmove', earlyMove);
    assert.equal(earlyMove.defaultPrevented, true);
    assert.deepEqual(calls, []);
    doc.fire('touchmove', createTouchEvent({ clientY: 126, timeStamp: 40 }));
    doc.fire('touchend', createTouchEvent({ clientY: 126, timeStamp: 80, ended: true }));
    assert.deepEqual(
        calls,
        ['begin:100', 'update:126', 'end:126'],
        'touch pull-down must preserve the original start point for sheet drag strength'
    );
}

console.log('mobile sheet pull-down smoke ok');

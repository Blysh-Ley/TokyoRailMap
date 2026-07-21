import assert from 'node:assert/strict';

import {
    clampMobileSheetOffset,
    createMobileSheetDragSession,
    getMobileSheetOffsetForState,
    getMobileSheetSnapPoints,
    getNearestMobileSheetStateByOffset,
    resolveMobileSheetDragTarget,
    updateMobileSheetDragSession
} from '../src/ui/mobileSheetSnap.js';

const points = getMobileSheetSnapPoints({ height: 880, peekPx: 86 });
assert.deepEqual(points, {
    expanded: 0,
    half: 440,
    collapsed: 794
});

assert.equal(getMobileSheetOffsetForState('expanded', { height: 880, peekPx: 86 }), 0);
assert.equal(getMobileSheetOffsetForState('half', { height: 880, peekPx: 86 }), 440);
assert.equal(getMobileSheetOffsetForState('collapsed', { height: 880, peekPx: 86 }), 794);

assert.equal(clampMobileSheetOffset(-20, { height: 880, peekPx: 86 }), 0);
assert.equal(clampMobileSheetOffset(900, { height: 880, peekPx: 86 }), 794);

assert.equal(getNearestMobileSheetStateByOffset(80, { height: 880, peekPx: 86 }), 'expanded');
assert.equal(getNearestMobileSheetStateByOffset(390, { height: 880, peekPx: 86 }), 'half');
assert.equal(getNearestMobileSheetStateByOffset(760, { height: 880, peekPx: 86 }), 'collapsed');

const makeSession = ({ startState = 'expanded', startY = 0, nowMs = 0 } = {}) => createMobileSheetDragSession({
    startY,
    startState,
    startOffset: getMobileSheetOffsetForState(startState, { height: 880, peekPx: 86 }),
    height: 880,
    peekPx: 86,
    nowMs
});

const resolveAfterMove = ({ startState, startY = 0, endY, moveAt = 100, endAt = moveAt }) => {
    const session = makeSession({ startState, startY });
    updateMobileSheetDragSession(session, { clientY: endY, nowMs: moveAt });
    return resolveMobileSheetDragTarget(session, { clientY: endY, nowMs: endAt });
};

assert.equal(
    resolveAfterMove({ startState: 'expanded', endY: 390, moveAt: 1000 }),
    'half',
    'slow release near the half point should choose half'
);
assert.equal(
    resolveAfterMove({ startState: 'half', endY: 760, moveAt: 1000 }),
    'collapsed',
    'slow release near the collapsed point should choose collapsed'
);
assert.equal(
    resolveAfterMove({ startState: 'expanded', endY: 50, moveAt: 50 }),
    'half',
    'quick downward flick from expanded should advance to half even with a short distance'
);
assert.equal(
    resolveAfterMove({ startState: 'half', startY: 500, endY: 450, moveAt: 60 }),
    'expanded',
    'quick upward flick from half should expand'
);
assert.equal(
    resolveAfterMove({ startState: 'half', endY: 60, moveAt: 60 }),
    'collapsed',
    'quick downward flick from half should collapse'
);
assert.equal(
    resolveAfterMove({ startState: 'expanded', endY: 700, moveAt: 90 }),
    'collapsed',
    'strong downward fling can skip directly to collapsed'
);
assert.equal(
    resolveAfterMove({ startState: 'half', startY: 500, endY: 510, moveAt: 80 }),
    'half',
    'small jitter should keep the starting state'
);

const cancelled = makeSession({ startState: 'collapsed' });
updateMobileSheetDragSession(cancelled, { clientY: 200, nowMs: 80 });
assert.equal(
    resolveMobileSheetDragTarget(cancelled, { clientY: 200, nowMs: 80, cancelled: true }),
    'collapsed',
    'cancelled drag should restore the starting state'
);

console.log('mobile sheet snap smoke ok');

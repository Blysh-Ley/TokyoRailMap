import assert from 'node:assert/strict';

import {
    clampMobileSheetOffset,
    getMobileSheetOffsetForState,
    getMobileSheetSnapPoints,
    getNearestMobileSheetStateByOffset
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

console.log('mobile sheet snap smoke ok');

import assert from 'node:assert/strict';

import { getPanelMarqueeKeyframes } from '../src/features/panel/panelMarqueeController.js';

{
    const { duration, keyframes } = getPanelMarqueeKeyframes({
        distancePx: 70,
        holdMs: 2000,
        speedPxPerSec: 35,
        minTravelMs: 1500
    });

    assert.equal(duration, 8000);
    assert.equal(keyframes.length, 6);
    assert.deepEqual(keyframes.map((frame) => frame.transform), [
        'translateX(0px)',
        'translateX(0px)',
        'translateX(-70px)',
        'translateX(-70px)',
        'translateX(0px)',
        'translateX(0px)'
    ]);
    assert.equal(keyframes[1].offset, 0.25);
    assert.equal(keyframes[2].offset, 0.5);
    assert.equal(keyframes[3].offset, 0.75);
    assert.equal(keyframes[5].offset, 1);
}

{
    const { duration, keyframes } = getPanelMarqueeKeyframes({
        distancePx: 1,
        holdMs: 2000,
        speedPxPerSec: 30,
        minTravelMs: 1200
    });

    assert.equal(duration, 7200);
    assert.equal(keyframes[2].transform, 'translateX(-1px)');
    assert.ok(keyframes[4].offset > keyframes[3].offset);
}

console.log('panel marquee controller smoke ok');

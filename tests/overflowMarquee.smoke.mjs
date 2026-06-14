import assert from 'node:assert/strict';

import {
    applyOverflowTextMarquees,
    measureOverflowMarquee,
    scheduleOverflowTextMarquees
} from '../src/ui/overflowMarquee.js';

const makeMarquee = ({ viewportW, contentW }) => {
    const inner = {
        offsetWidth: contentW,
        scrollWidth: contentW,
        style: {},
        animate(keyframes, options) {
            this.animation = { keyframes, options };
            return {
                playState: 'running',
                cancel() {
                    this.playState = 'idle';
                }
            };
        },
        getBoundingClientRect() {
            return { width: contentW };
        }
    };
    const marquee = {
        clientWidth: viewportW,
        offsetWidth: viewportW,
        style: {},
        inner,
        querySelector(selector) {
            return selector === '.inner' ? inner : null;
        },
        getBoundingClientRect() {
            return { top: 0, bottom: 20, width: viewportW };
        }
    };
    return { marquee, inner };
};

const overflowing = makeMarquee({ viewportW: 80, contentW: 140 });
assert.deepEqual(measureOverflowMarquee(overflowing.marquee, overflowing.inner), {
    viewportW: 80,
    contentW: 140
});

const fitting = makeMarquee({ viewportW: 160, contentW: 120 });
const root = {
    querySelectorAll(selector) {
        return selector === '.marquee' ? [overflowing.marquee, fitting.marquee] : [];
    }
};

assert.equal(applyOverflowTextMarquees(root, {
    marqueeSelector: '.marquee',
    innerSelector: '.inner',
    maxAnimations: 4
}), 1);
assert.ok(overflowing.inner.animation, 'overflowing text should start an animation');
assert.equal(fitting.inner.animation, undefined, 'fitting text should stay static');

let rafCount = 0;
const scheduledRoot = {
    querySelectorAll(selector) {
        return selector === '.marquee' ? [overflowing.marquee] : [];
    }
};
const win = {
    requestAnimationFrame(callback) {
        rafCount += 1;
        callback();
        return rafCount;
    },
    cancelAnimationFrame() {}
};
assert.equal(scheduleOverflowTextMarquees(scheduledRoot, {
    marqueeSelector: '.marquee',
    innerSelector: '.inner',
    win
}), true);
assert.equal(rafCount, 2, 'marquee scheduling must use a two-frame measurement delay');

console.log('overflow marquee smoke ok');

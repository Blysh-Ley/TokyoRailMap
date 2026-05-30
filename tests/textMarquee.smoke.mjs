import assert from 'node:assert/strict';

import {
    applyTextMarquees,
    buildTextMarqueeAnimation,
    measureTextMarquee,
    scheduleTextMarqueeApply,
    startTextMarquee
} from '../src/ui/textMarquee.js';

const createElement = ({
    clientWidth = 0,
    offsetWidth = 0,
    rectWidth = 0,
    scrollWidth = 0
} = {}) => ({
    clientWidth,
    offsetWidth,
    scrollWidth,
    style: {},
    getBoundingClientRect: () => ({ width: rectWidth })
});

{
    const marqueeEl = createElement({ clientWidth: 80 });
    const innerEl = createElement({ rectWidth: 140, scrollWidth: 0 });
    const measurement = measureTextMarquee(marqueeEl, innerEl);
    assert.equal(measurement.viewportWidth, 80);
    assert.equal(measurement.contentWidth, 140);
    assert.equal(measurement.distancePx, 60);
}

{
    const animation = buildTextMarqueeAnimation({
        distancePx: 70,
        endHoldMs: 2000,
        holdMs: 2000,
        minTravelMs: 1200,
        speedPxPerSec: 35
    });
    assert.deepEqual(animation.keyframes.map((frame) => frame.transform), [
        'translateX(0px)',
        'translateX(0px)',
        'translateX(-70px)',
        'translateX(-70px)'
    ]);
    assert.equal(animation.keyframes.at(-1).offset, 1);
    assert.equal(animation.options.iterations, Infinity);
    assert.equal(animation.options.easing, 'linear');
}

{
    const calls = [];
    const marqueeEl = createElement({ clientWidth: 90 });
    const innerEl = createElement({ scrollWidth: 160 });
    innerEl.animate = (keyframes, options) => {
        calls.push({ keyframes, options });
        return { cancel: () => calls.push({ cancel: true }) };
    };

    assert.equal(startTextMarquee({ marqueeEl, innerEl }), true);
    assert.equal(calls.length, 1);
    assert.ok(marqueeEl.__textMarqueeAnim);

    assert.equal(startTextMarquee({
        marqueeEl: createElement({ clientWidth: 180 }),
        innerEl: {
            ...createElement({ scrollWidth: 160 }),
            animate: () => {
                throw new Error('must not animate text that fits');
            }
        }
    }), false);
}

{
    const started = [];
    const rootEl = {
        querySelectorAll: () => [
            {
                clientWidth: 90,
                querySelector: () => ({
                    animate: () => {
                        started.push('first');
                        return {};
                    },
                    scrollWidth: 180,
                    style: {}
                })
            },
            {
                clientWidth: 160,
                querySelector: () => ({
                    animate: () => {
                        throw new Error('must not animate fitted text');
                    },
                    scrollWidth: 140,
                    style: {}
                })
            }
        ]
    };

    const count = applyTextMarquees(rootEl, {
        innerSelector: '.inner',
        selector: '.marquee'
    });
    assert.equal(count, 1);
    assert.deepEqual(started, ['first']);
}

{
    const frames = [];
    const applied = [];
    const rootEl = {};
    const requestFrame = (callback) => {
        frames.push(callback);
        return frames.length;
    };

    assert.equal(scheduleTextMarqueeApply(rootEl, {
        apply: () => applied.push('apply'),
        requestFrame
    }), true);
    assert.equal(applied.length, 0);
    frames.shift()();
    assert.equal(applied.length, 0);
    frames.shift()();
    assert.deepEqual(applied, ['apply']);
}

{
    const frames = [];
    const timers = [];
    const applied = [];
    const rootEl = {};
    const requestFrame = (callback) => {
        frames.push(callback);
        return frames.length;
    };
    const setTimer = (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
    };

    scheduleTextMarqueeApply(rootEl, {
        apply: () => {
            applied.push('apply');
            return applied.length >= 2 ? 1 : 0;
        },
        requestFrame,
        retryDelaysMs: [120, 360],
        setTimer
    });
    frames.shift()();
    frames.shift()();
    assert.deepEqual(applied, ['apply']);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 120);
    timers.shift().callback();
    assert.deepEqual(applied, ['apply', 'apply']);
    assert.equal(timers.length, 0);
}

console.log('text marquee smoke ok');

import assert from 'node:assert/strict';

import {
    createPanelMarqueeController,
    getPanelMarqueeKeyframes
} from '../src/features/panel/panelMarqueeController.js';

class FakeElement {
    constructor({
        className = '',
        clientWidth = 0,
        offsetWidth = 0,
        scrollWidth = 0,
        rectWidth = 0,
        children = []
    } = {}) {
        this.className = className;
        this.clientWidth = clientWidth;
        this.offsetWidth = offsetWidth;
        this.scrollWidth = scrollWidth;
        this.rectWidth = rectWidth;
        this.children = children;
        this.style = {};
        this.__panelMarqueeAnim = null;
        this.__panelMarqueeRafId = 0;
    }

    matches(selector) {
        return selector
            .split(',')
            .map((item) => item.trim())
            .some((item) => item.startsWith('.') && this.className.split(/\s+/).includes(item.slice(1)));
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const out = [];
        const visit = (node) => {
            if (node !== this && node.matches?.(selector)) out.push(node);
            for (const child of node.children || []) visit(child);
        };
        visit(this);
        return out;
    }

    closest() {
        return null;
    }

    getBoundingClientRect() {
        return {
            bottom: this.rectWidth,
            height: this.rectWidth,
            left: 0,
            right: this.rectWidth,
            top: 0,
            width: this.rectWidth
        };
    }
}

const createFakeWindow = ({ reducedMotion = false } = {}) => {
    const queue = [];
    return {
        Element: FakeElement,
        matchMedia: () => ({ matches: reducedMotion }),
        requestAnimationFrame: (fn) => {
            queue.push(fn);
            return queue.length;
        },
        cancelAnimationFrame: () => {},
        flushFrames: () => {
            while (queue.length) queue.shift()?.();
        }
    };
};

const makeDirMarqueeRoot = ({
    clientWidth = 0,
    offsetWidth = 0,
    scrollWidth = 0,
    rectWidth = 0,
    contentOffsetWidth = 0,
    contentRectWidth = 0,
    animate
} = {}) => {
    const inner = new FakeElement({
        className: 'panel-dir-marquee-inner',
        offsetWidth: contentOffsetWidth,
        rectWidth: contentRectWidth,
        scrollWidth
    });
    if (animate) inner.animate = animate;
    const marquee = new FakeElement({
        className: 'panel-dir-marquee',
        clientWidth,
        offsetWidth,
        rectWidth,
        children: [inner]
    });
    const root = new FakeElement({ children: [marquee] });
    return { inner, marquee, root };
};

const makeTimetableMarqueeRoot = ({
    clientWidth = 0,
    scrollWidth = 0,
    animate
} = {}) => {
    const inner = new FakeElement({
        className: 'panel-timetable-dest-marquee-inner',
        scrollWidth
    });
    if (animate) inner.animate = animate;
    const marquee = new FakeElement({
        className: 'panel-timetable-dest-marquee',
        clientWidth,
        children: [inner]
    });
    const root = new FakeElement({ children: [marquee] });
    return { inner, marquee, root };
};

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

{
    let animateCall = null;
    const win = createFakeWindow();
    const { inner, marquee, root } = makeDirMarqueeRoot({
        clientWidth: 0,
        offsetWidth: 120,
        scrollWidth: 220,
        animate: (keyframes, options) => {
            animateCall = { keyframes, options };
            return { cancel: () => {} };
        }
    });
    const canceled = { count: 0 };
    marquee.__panelMarqueeAnim = { cancel: () => { canceled.count += 1; } };

    const controller = createPanelMarqueeController({ win });
    assert.equal(controller.applyDirHeaderMarquees(root), 1);
    assert.equal(canceled.count, 1);
    assert.equal(inner.style.transform, '');
    assert.equal(animateCall.keyframes[2].transform, 'translateX(-100px)');
    assert.equal(animateCall.options.iterations, Infinity);
}

{
    let animateCalls = 0;
    const win = createFakeWindow();
    const { marquee, root } = makeDirMarqueeRoot({
        clientWidth: 180,
        scrollWidth: 180,
        animate: () => {
            animateCalls += 1;
            return { cancel: () => {} };
        }
    });
    let canceled = false;
    marquee.__panelMarqueeAnim = { cancel: () => { canceled = true; } };

    const controller = createPanelMarqueeController({ win });
    assert.equal(controller.applyDirHeaderMarquees(root), 0);
    assert.equal(canceled, true);
    assert.equal(animateCalls, 0);
    assert.equal(marquee.__panelMarqueeAnim, null);
}

{
    let animateCalls = 0;
    const win = createFakeWindow({ reducedMotion: true });
    const { root } = makeDirMarqueeRoot({
        clientWidth: 100,
        scrollWidth: 200,
        animate: () => {
            animateCalls += 1;
            return { cancel: () => {} };
        }
    });

    const controller = createPanelMarqueeController({ win });
    assert.equal(controller.applyDirHeaderMarquees(root), 1);
    assert.equal(animateCalls, 1);
}

{
    let animateCalls = 0;
    const win = createFakeWindow({ reducedMotion: true });
    const { root } = makeTimetableMarqueeRoot({
        clientWidth: 100,
        scrollWidth: 200,
        animate: () => {
            animateCalls += 1;
            return { cancel: () => {} };
        }
    });

    const controller = createPanelMarqueeController({ win });
    assert.equal(controller.applyTimetableDestMarquees(root), 0);
    assert.equal(animateCalls, 0);
}

{
    let animateCalls = 0;
    const win = createFakeWindow();
    const { root } = makeDirMarqueeRoot({
        clientWidth: 100,
        scrollWidth: 240,
        animate: () => {
            animateCalls += 1;
            return { cancel: () => {} };
        }
    });

    const controller = createPanelMarqueeController({ win });
    controller.schedule(root);
    assert.equal(animateCalls, 0);
    win.flushFrames();
    assert.equal(animateCalls, 1);
    assert.equal(root.__panelMarqueeRafId, 0);
}

console.log('panel marquee controller smoke ok');

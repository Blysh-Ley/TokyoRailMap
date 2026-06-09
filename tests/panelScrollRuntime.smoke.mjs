import assert from 'node:assert/strict';

import { createPanelScrollRuntime } from '../src/features/panel/panelScrollRuntime.js';

class FakeElement {
    constructor(lineId = '') {
        this.attributes = new Map();
        if (lineId) this.attributes.set('data-line-id', lineId);
        this.scrollTop = 0;
        this.clientHeight = 200;
        this.rectTop = 0;
        this.rectHeight = 40;
        this.scrollCalls = [];
    }

    getAttribute(name) {
        return this.attributes.get(name) || '';
    }

    getBoundingClientRect() {
        return {
            top: this.rectTop,
            height: this.rectHeight
        };
    }

    scrollTo(options) {
        this.scrollCalls.push(options);
        this.scrollTop = options.top;
    }
}

const lineA = new FakeElement('line-a');
lineA.rectTop = 120;
lineA.rectHeight = 40;

const lineB = new FakeElement('line-b');
lineB.rectTop = 260;
lineB.rectHeight = 60;

const body = new FakeElement();
body.clientHeight = 200;
body.rectTop = 20;
body.scrollTop = 50;
body.querySelectorAll = (selector) => selector === '[data-line-id]' ? [lineA, lineB] : [];

const syncedTitles = [];
const delayedTasks = [];

const runtime = createPanelScrollRuntime({
    body,
    syncActiveTitle: (activeLineId) => syncedTitles.push(activeLineId),
    setTimeoutFn: (callback, ms) => delayedTasks.push({ callback, ms })
});

assert.equal(runtime.scrollToLineId('line-a', { behavior: 'auto', block: 'start' }), true);
assert.deepEqual(body.scrollCalls.at(-1), { top: 150, behavior: 'auto' });

assert.equal(runtime.scrollToLineId('line-b', { block: 'center' }), true);
assert.deepEqual(body.scrollCalls.at(-1), { top: 320, behavior: 'smooth' });

body.querySelectorAll = () => [];
assert.equal(runtime.scrollToLineId('line-missing'), false);
assert.equal(delayedTasks.length, 1);
assert.equal(delayedTasks[0].ms, 120);

delayedTasks[0].callback();
assert.deepEqual(body.scrollCalls.at(-1), { top: 320, behavior: 'smooth' });

const lateLine = new FakeElement('line-late');
lateLine.rectTop = 120;
body.querySelectorAll = () => [];
assert.equal(runtime.scrollToLineId('line-late'), false);
assert.equal(delayedTasks.length, 2);
body.querySelectorAll = (selector) => selector === '[data-line-id]' ? [lateLine] : [];
delayedTasks[1].callback();
assert.deepEqual(body.scrollCalls.at(-1), { top: 420, behavior: 'smooth' });

assert.equal(runtime.getScrollTop(), 420);
assert.equal(runtime.setScrollTop(88, { behavior: 'smooth' }), true);
assert.deepEqual(body.scrollCalls.at(-1), { top: 88, behavior: 'smooth' });

runtime.syncPanelTitleForActiveLine('line-b');
assert.deepEqual(syncedTitles, ['line-b']);

console.log('panel scroll runtime smoke ok');

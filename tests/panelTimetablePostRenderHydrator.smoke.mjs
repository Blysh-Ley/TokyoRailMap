import assert from 'node:assert/strict';

import {
    applyTimetableBodyScrollState,
    hydrateRenderedTimetable
} from '../src/features/panel/panelTimetablePostRenderHydrator.js';

class FakeClassList {
    constructor(tokens = []) {
        this.tokens = new Set(tokens);
    }

    contains(name) {
        return this.tokens.has(name);
    }
}

class FakeElement {
    constructor({ classes = [], selectorMap = {}, offsetHeight = 0, offsetTop = 0 } = {}) {
        this.classList = new FakeClassList(classes);
        this.selectorMap = selectorMap;
        this.style = {};
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientHeight = 0;
        this.offsetHeight = offsetHeight;
        this.offsetTop = offsetTop;
        this.rectTop = 0;
        this.rectHeight = offsetHeight;
    }

    querySelectorAll(selector) {
        return this.selectorMap[selector] || [];
    }

    querySelector(selector) {
        const value = this.selectorMap[selector];
        return Array.isArray(value) ? value[0] || null : value || null;
    }

    getBoundingClientRect() {
        return {
            top: this.rectTop,
            height: this.rectHeight
        };
    }
}

class FakeImageElement extends FakeElement {}

globalThis.Element = FakeElement;
globalThis.HTMLImageElement = FakeImageElement;

const filterIcon = new FakeImageElement();
const printIcon = new FakeImageElement();
const hydratedIcons = [];

const pastCell = new FakeElement();
pastCell.rectTop = 110;

const gridBody = new FakeElement({
    classes: ['panel-timetable', 'is-expanded', 'panel-timetable-view-grid'],
    selectorMap: {
        '.panel-grid-cell-trip.is-past': [pastCell]
    }
});
gridBody.clientHeight = 120;
gridBody.scrollHeight = 320;
gridBody.rectTop = 20;
gridBody.scrollTop = 30;

const listRowA = new FakeElement({ classes: ['panel-timetable-row', 'is-past'], offsetHeight: 22 });
const listRowB = new FakeElement({ classes: ['panel-timetable-row', 'is-past'], offsetHeight: 22 });
const listRowC = new FakeElement({ classes: ['panel-timetable-row'], offsetHeight: 22 });
const listBody = new FakeElement({
    classes: ['panel-timetable', 'is-expanded'],
    selectorMap: {
        '.panel-timetable-row': [listRowA, listRowB, listRowC]
    }
});
listBody.clientHeight = 80;
listBody.scrollHeight = 220;

const currentHourRow = new FakeElement({ offsetHeight: 88 });
const collapsedGridBody = new FakeElement({
    classes: ['panel-timetable', 'panel-timetable-view-grid', 'is-collapsed'],
    selectorMap: {
        '[data-grid-current-hour="1"]': currentHourRow
    }
});

const ttEl = new FakeElement({
    selectorMap: {
        '.panel-dir-filter-icon': [filterIcon],
        '.panel-dir-print-icon': [printIcon],
        '.panel-timetable.is-expanded': [gridBody, listBody],
        '.panel-timetable.panel-timetable-view-grid.is-collapsed': [collapsedGridBody]
    }
});

hydrateRenderedTimetable(ttEl, {
    ElementRef: FakeElement,
    HTMLImageElementRef: FakeImageElement,
    getIconCandidates: (name) => [name],
    getPreferredCachedImageSrc: (candidates) => candidates[0],
    setImageElementFromCache: (icon, candidates, options) => {
        hydratedIcons.push({ icon, candidates, options });
        return Promise.resolve();
    }
});

assert.equal(hydratedIcons.length, 2);
assert.equal(hydratedIcons[0].options.cacheKey, 'icon:filter.svg');
assert.equal(hydratedIcons[1].options.cacheKey, 'icon:print.svg');

assert.equal(gridBody.style.maxHeight, '');
assert.equal(gridBody.scrollTop, 110);
assert.equal(listBody.scrollTop, 22);
assert.equal(collapsedGridBody.style.maxHeight, '89px');
assert.equal(collapsedGridBody.scrollTop, 0);

const fallbackGridBody = new FakeElement({
    classes: ['panel-timetable', 'is-expanded', 'panel-timetable-view-grid'],
    selectorMap: {
        '[data-grid-focus-start="1"]': new FakeElement({ offsetTop: 72 })
    }
});
applyTimetableBodyScrollState(new FakeElement({
    selectorMap: {
        '.panel-timetable.is-expanded': [fallbackGridBody],
        '.panel-timetable.panel-timetable-view-grid.is-collapsed': []
    }
}), { ElementRef: FakeElement });
assert.equal(fallbackGridBody.scrollTop, 72);

console.log('panel timetable post-render hydrator smoke ok');

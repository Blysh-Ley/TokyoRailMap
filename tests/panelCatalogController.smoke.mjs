import assert from 'node:assert/strict';

import {
    createPanelCatalogController,
    resolvePanelCatalogActiveLineState,
    resolvePanelCatalogTitle,
    shouldShowPanelCatalog
} from '../src/features/panel/panelCatalogController.js';

class FakeClassList {
    constructor(owner) {
        this.owner = owner;
        this.tokens = new Set();
    }

    setFromString(value) {
        this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
        this.owner._className = Array.from(this.tokens).join(' ');
    }

    syncOwner() {
        this.owner._className = Array.from(this.tokens).join(' ');
    }

    add(...names) {
        for (const name of names) {
            if (name) this.tokens.add(name);
        }
        this.syncOwner();
    }

    remove(...names) {
        for (const name of names) {
            this.tokens.delete(name);
        }
        this.syncOwner();
    }

    contains(name) {
        return this.tokens.has(name);
    }

    toggle(name, force) {
        if (force === true) {
            this.tokens.add(name);
            this.syncOwner();
            return true;
        }
        if (force === false) {
            this.tokens.delete(name);
            this.syncOwner();
            return false;
        }
        if (this.tokens.has(name)) {
            this.tokens.delete(name);
            this.syncOwner();
            return false;
        }
        this.tokens.add(name);
        this.syncOwner();
        return true;
    }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this._className = '';
        this.classList = new FakeClassList(this);
        this.attributes = new Map();
        this.children = [];
        this.listeners = new Map();
        this.parentElement = null;
        this.scrollHeight = 0;
        this.clientHeight = 0;
        this.rectTop = 0;
        this.textContent = '';
        this.querySelectorAllHandler = null;
    }

    get className() {
        return this._className;
    }

    set className(value) {
        this.classList.setFromString(value);
    }

    append(...children) {
        for (const child of children) {
            if (!child) continue;
            child.parentElement = this;
            this.children.push(child);
        }
    }

    appendChild(child) {
        this.append(child);
        return child;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || '';
    }

    addEventListener(type, handler) {
        const list = this.listeners.get(type) || [];
        list.push(handler);
        this.listeners.set(type, list);
    }

    removeEventListener(type, handler) {
        const list = this.listeners.get(type) || [];
        this.listeners.set(type, list.filter((item) => item !== handler));
    }

    dispatchEvent(type, event = {}) {
        const list = this.listeners.get(type) || [];
        for (const handler of list) handler(event);
    }

    querySelectorAll(selector) {
        if (typeof this.querySelectorAllHandler === 'function') {
            return this.querySelectorAllHandler(selector);
        }
        return [];
    }

    getBoundingClientRect() {
        return { top: this.rectTop };
    }

    closest(selector) {
        if (selector === '.panel-catalog-line[data-panel-catalog-line-id]') {
            const hasLineClass = this.classList.contains('panel-catalog-line');
            const hasLineId = !!this.getAttribute('data-panel-catalog-line-id');
            return hasLineClass && hasLineId ? this : null;
        }
        return null;
    }
}

globalThis.Element = FakeElement;
globalThis.HTMLImageElement = class FakeImageElement extends FakeElement {};

const titleState = [];
const stationsIndex = {
    idToNameZh: new Map([
        ['station-a', 'A站'],
        ['station-b', 'B站']
    ]),
    idToNameEn: new Map([
        ['station-a', 'Station A'],
        ['station-b', 'Station B']
    ])
};

assert.deepEqual(
    resolvePanelCatalogTitle({
        activeLineId: 'line-b',
        currentLineStationMetaByLineId: new Map([
            ['line-b', { stationId: 'station-b' }]
        ]),
        currentStationId: 'station-a',
        currentStationNameZh: '默认站',
        currentStationsIndex: stationsIndex
    }),
    { main: 'B站', sub: 'Station B' }
);

const body = new FakeElement('div');
body.scrollHeight = 600;
body.clientHeight = 300;
body.rectTop = 200;

const lineA = new FakeElement('section');
lineA.setAttribute('data-line-id', 'line-a');
lineA.rectTop = 80;
const lineB = new FakeElement('section');
lineB.setAttribute('data-line-id', 'line-b');
lineB.rectTop = 130;
body.querySelectorAllHandler = (selector) => selector === '[data-line-id]' ? [lineA, lineB] : [];

assert.deepEqual(
    resolvePanelCatalogActiveLineState({
        body,
        forcedActiveLineId: 'line-forced',
        forcedActiveUntilMs: 300,
        nowMs: () => 200
    }),
    {
        activeLineId: 'line-forced',
        forcedActiveLineId: 'line-forced',
        forcedActiveUntilMs: 300,
        usedForced: true
    }
);

const activeState = resolvePanelCatalogActiveLineState({
    body,
    forcedActiveLineId: 'line-forced',
    forcedActiveUntilMs: 300,
    nowMs: () => 400
});
assert.equal(activeState.activeLineId, 'line-b');
assert.equal(activeState.forcedActiveLineId, '');
assert.equal(activeState.usedForced, false);

assert.equal(
    shouldShowPanelCatalog({
        body,
        dismissedByUser: false,
        entries: [{ companyName: 'JR', lines: [{ lineId: 'line-a', lineName: 'A线' }] }],
        panelVisible: true
    }),
    true
);
assert.equal(
    shouldShowPanelCatalog({
        body,
        dismissedByUser: true,
        entries: [{ companyName: 'JR', lines: [{ lineId: 'line-a', lineName: 'A线' }] }],
        panelVisible: true
    }),
    false
);

const documentRef = {
    createElement(tagName) {
        return tagName === 'img' ? new globalThis.HTMLImageElement(tagName) : new FakeElement(tagName);
    }
};

const titleElement = new FakeElement('button');
const panelShell = { isVisible: () => true };
const mountedOverlays = [];
const stopEvents = [];
const scrollCalls = [];
const frameQueue = [];
let nextFrameId = 1;

const controller = createPanelCatalogController({
    body,
    documentRef,
    mountShellOverlay: (node) => mountedOverlays.push(node),
    panelShell,
    titleElement,
    collectEntries: () => [{
        companyName: 'JR',
        lines: [
            { lineId: 'line-a', lineName: 'A线' },
            { lineId: 'line-b', lineName: 'B线' }
        ]
    }],
    renderEntries: (catalogBody, entries) => {
        const buttons = [];
        for (const group of entries) {
            for (const line of group.lines) {
                const button = new FakeElement('button');
                button.className = 'panel-catalog-line';
                button.setAttribute('data-panel-catalog-line-id', line.lineId);
                button.textContent = line.lineName;
                buttons.push(button);
            }
        }
        catalogBody.querySelectorAllHandler = (selector) => (
            selector === '.panel-catalog-line[data-panel-catalog-line-id]' ? buttons : []
        );
    },
    hydrateCloseIcon: () => {},
    getCurrentLineStationMetaByLineId: () => new Map([
        ['line-a', { stationId: 'station-a' }],
        ['line-b', { stationId: 'station-b' }]
    ]),
    getCurrentStationId: () => 'station-a',
    getCurrentStationNameZh: () => '默认站',
    getCurrentStationsIndex: () => stationsIndex,
    setTitle: (value) => titleState.push(value),
    scrollToLineId: (lineId, options) => {
        scrollCalls.push({ lineId, options });
        return true;
    },
    stopEvent: (evt) => stopEvents.push(evt),
    requestFrame: (callback) => {
        const id = nextFrameId++;
        frameQueue.push({ id, callback });
        return id;
    },
    cancelFrame: (id) => {
        const index = frameQueue.findIndex((item) => item.id === id);
        if (index >= 0) frameQueue.splice(index, 1);
    },
    createMutationObserver: null,
    createResizeObserver: null,
    nowMs: () => 1000
});

const flushFrames = () => {
    while (frameQueue.length) {
        const queue = frameQueue.splice(0, frameQueue.length);
        for (const item of queue) item.callback();
    }
};

assert.equal(mountedOverlays.length, 1);
controller.scheduleRefresh();
flushFrames();

const { catalogBody, catalogCloseBtn, catalogPanel } = controller.elements;
const catalogButtons = catalogBody.querySelectorAll('.panel-catalog-line[data-panel-catalog-line-id]');

assert.equal(catalogPanel.classList.contains('is-visible'), true);
assert.equal(catalogButtons.length, 2);
assert.equal(catalogButtons[1].classList.contains('is-active'), true);
assert.deepEqual(titleState.at(-1), { main: 'B站', sub: 'Station B' });

catalogPanel.dispatchEvent('mouseenter');
catalogPanel.dispatchEvent('mouseleave');
assert.equal(catalogPanel.classList.contains('is-compact'), true);

const clickEvent = { target: catalogButtons[0] };
catalogPanel.dispatchEvent('click', clickEvent);
assert.equal(stopEvents.includes(clickEvent), true);
assert.deepEqual(scrollCalls.at(-1), {
    lineId: 'line-a',
    options: { behavior: 'smooth', block: 'start' }
});
assert.deepEqual(titleState.at(-1), { main: 'A站', sub: 'Station A' });
assert.equal(catalogButtons[0].classList.contains('is-active'), true);

const closeEvent = { target: catalogCloseBtn };
catalogCloseBtn.dispatchEvent('click', closeEvent);
flushFrames();
assert.equal(catalogPanel.classList.contains('is-visible'), false);

titleElement.dispatchEvent('click', { target: titleElement });
flushFrames();
assert.equal(catalogPanel.classList.contains('is-visible'), true);

controller.destroy();

console.log('panel catalog controller smoke ok');

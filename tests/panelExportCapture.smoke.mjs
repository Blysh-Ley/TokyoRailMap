import assert from 'node:assert/strict';

import {
    collectScrollableState,
    exportElementToPng,
    nowIsoCompact,
    restoreScrollableState,
    sanitizePanelExportFilePart
} from '../src/features/panel/panelExportCapture.js';

class FakeClassList {
    constructor(owner) {
        this.owner = owner;
        this.tokens = new Set();
    }

    setFromString(value) {
        this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
        this.sync();
    }

    sync() {
        this.owner._className = Array.from(this.tokens).join(' ');
    }

    add(name) {
        if (name) this.tokens.add(name);
        this.sync();
    }

    remove(name) {
        this.tokens.delete(name);
        this.sync();
    }

    contains(name) {
        return this.tokens.has(name);
    }
}

class FakeHTMLElement {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this._className = '';
        this.classList = new FakeClassList(this);
        this.attributes = new Map();
        this.children = [];
        this.parentElement = null;
        this.style = {
            height: '',
            maxHeight: '',
            overflowY: '',
            overflowX: ''
        };
        this.scrollHeight = 0;
        this.clientHeight = 0;
        this.scrollWidth = 0;
        this.clientWidth = 0;
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.dataset = {};
        this.disabled = false;
        this.clicked = false;
        this.textContent = '';
    }

    get className() {
        return this._className;
    }

    set className(value) {
        this.classList.setFromString(value);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || '';
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (!this.parentElement) return;
        const siblings = this.parentElement.children;
        const index = siblings.indexOf(this);
        if (index >= 0) siblings.splice(index, 1);
        this.parentElement = null;
    }

    querySelectorAll(selector) {
        if (selector === '*') return this.children.slice();
        return [];
    }

    click() {
        this.clicked = true;
    }
}

class FakeHTMLButtonElement extends FakeHTMLElement {}

globalThis.HTMLElement = FakeHTMLElement;
globalThis.HTMLButtonElement = FakeHTMLButtonElement;

assert.equal(
    nowIsoCompact(new Date(2026, 5, 9, 1, 2, 3)),
    '20260609-010203'
);
assert.equal(
    sanitizePanelExportFilePart('Tokyo Rail/Map?'),
    'Tokyo_Rail_Map_'
);

const root = new FakeHTMLElement('section');
root.style.height = '100px';
root.style.maxHeight = '120px';
root.style.overflowY = 'auto';
root.scrollHeight = 320;
root.clientHeight = 100;
root.scrollTop = 24;

const child = new FakeHTMLElement('div');
child.style.overflowX = 'auto';
child.scrollWidth = 420;
child.clientWidth = 180;
child.scrollLeft = 12;
child.computedStyle = { overflowX: 'auto', overflowY: 'hidden' };
root.computedStyle = { overflowY: 'auto', overflowX: 'hidden' };
root.appendChild(child);

const scrollStates = collectScrollableState(root, {
    HTMLElementRef: FakeHTMLElement,
    windowRef: {
        getComputedStyle: (node) => node.computedStyle || {}
    }
});

assert.equal(scrollStates.length, 2);
assert.equal(root.style.height, '320px');
assert.equal(root.style.maxHeight, 'none');
assert.equal(child.style.overflowX, 'visible');

restoreScrollableState(scrollStates, { HTMLElementRef: FakeHTMLElement });
assert.equal(root.style.height, '100px');
assert.equal(root.style.maxHeight, '120px');
assert.equal(root.scrollTop, 24);
assert.equal(child.scrollLeft, 12);

const fakeDocument = {
    documentElement: new FakeHTMLElement('html'),
    head: new FakeHTMLElement('head'),
    body: new FakeHTMLElement('body'),
    createElement(tagName) {
        return tagName === 'button'
            ? new FakeHTMLButtonElement(tagName)
            : new FakeHTMLElement(tagName);
    },
    querySelector(selector) {
        if (selector === 'style[data-panel-trip-detail-export-style="1"]') {
            return this.head.children.find((childEl) => (
                childEl.tagName === 'STYLE' &&
                childEl.getAttribute('data-panel-trip-detail-export-style') === '1'
            )) || null;
        }
        return null;
    }
};

const exportElement = new FakeHTMLElement('div');
exportElement.className = 'panel-trip-detail';
exportElement.style.height = '80px';
exportElement.style.maxHeight = '100px';
exportElement.style.overflowY = 'auto';
exportElement.scrollHeight = 240;
exportElement.clientHeight = 80;
exportElement.computedStyle = { overflowY: 'auto', overflowX: 'hidden' };

const exportButton = new FakeHTMLButtonElement('button');
const restoredSnapshots = [];
let downloadCall = null;

await exportElementToPng(exportElement, 'Tokyo Rail Map', exportButton, {
    HTMLElementRef: FakeHTMLElement,
    HTMLButtonElementRef: FakeHTMLButtonElement,
    documentRef: fakeDocument,
    windowRef: {
        devicePixelRatio: 1,
        requestAnimationFrame: (callback) => callback(),
        setTimeout: (callback) => callback()
    },
    ensureHtml2canvas: async () => async () => ({
        toBlob(callback) {
            callback({ kind: 'blob' });
        }
    }),
    collectScrollableStateFn: (...args) => collectScrollableState(...args),
    restoreScrollableStateFn: (states, options) => {
        restoredSnapshots.push(states);
        restoreScrollableState(states, options);
    },
    nextFrameFn: async () => {},
    downloadBlobFn: (blob, filename) => {
        downloadCall = { blob, filename };
    },
    nowIsoCompactFn: () => '20260609-010203',
    logger: {
        error(error) {
            throw error;
        }
    }
});

assert.deepEqual(downloadCall, {
    blob: { kind: 'blob' },
    filename: 'Tokyo_Rail_Map-20260609-010203.png'
});
assert.equal(exportButton.disabled, false);
assert.equal(fakeDocument.documentElement.classList.contains('is-panel-trip-detail-exporting'), false);
assert.equal(fakeDocument.head.children.length, 0);
assert.equal(restoredSnapshots.length, 1);

console.log('panel export capture smoke ok');

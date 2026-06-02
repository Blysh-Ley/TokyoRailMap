import assert from 'node:assert/strict';

class TestElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.textContent = '';
        this.dataset = {};
        this.style = {};
        this.children = [];
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    querySelector(selector) {
        if (!selector.startsWith('.')) return null;
        const className = selector.slice(1);
        return this.children.find((child) => String(child.className).split(/\s+/).includes(className)) || null;
    }
}

globalThis.HTMLElement = TestElement;
globalThis.MutationObserver = class {
    observe() {}
};
globalThis.document = {
    createElement: (tagName) => new TestElement(tagName),
    documentElement: {
        getAttribute: () => ''
    },
    querySelectorAll: () => []
};

const { createStationCodeBadgeElement } = await import('../src/lib/line-icons.js');

const badge = createStationCodeBadgeElement({ code: 'SI11', color: '#ff6600' });
const prefix = badge.querySelector('.rw-station-code-badge-prefix');
const suffix = badge.querySelector('.rw-station-code-badge-suffix');

assert.equal(badge.className, 'rw-station-code-badge');
assert.equal(badge.style.height, '20px');
assert.equal(badge.style.minWidth, '20px');
assert.equal(badge.style.border, '2px solid #ff6600');
assert.equal(badge.style.backgroundColor, '#fff');
assert.equal(badge.style.color, '#000');
assert.equal(prefix.textContent, 'SI');
assert.equal(prefix.style.backgroundColor, '#ff6600');
assert.equal(prefix.style.color, '#fff');
assert.equal(suffix.textContent, '11');
assert.equal(suffix.style.color, '#000');

console.log('station code badge element smoke ok');

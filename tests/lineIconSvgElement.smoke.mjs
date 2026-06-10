import assert from 'node:assert/strict';

class TestElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.className = '';
        this.textContent = '';
        this.dataset = {};
        this.style = {};
        this.children = [];
        this.attributes = {};
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children = children;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] || null;
    }

    querySelector(tagName) {
        const wanted = String(tagName || '').toUpperCase();
        return this.children.find((child) => child.tagName === wanted) || null;
    }
}

globalThis.HTMLElement = TestElement;
globalThis.MutationObserver = class {
    observe() {}
};
globalThis.document = {
    createElement: (tagName) => new TestElement(tagName),
    createElementNS: (_ns, tagName) => new TestElement(tagName),
    documentElement: {
        getAttribute: () => ''
    },
    querySelectorAll: () => []
};

const { createLineIconElement } = await import('../src/lib/line-icons.js');

const icon = createLineIconElement({ routeId: 'TokyoMetro.Ginza', code: 'G', color: '#f39700' });
const svg = icon.querySelector('svg');

assert.equal(icon.className, 'rw-line-icon');
assert.equal(icon.dataset.preset, 'circle-border');
assert.equal(icon.style.width, '25px');
assert.equal(icon.style.height, '25px');
assert.equal(icon.style.padding, '0');
assert.equal(icon.style.paddingBottom, undefined);
assert.equal(icon.style.transform, undefined);
assert.ok(svg);
assert.equal(svg.getAttribute('viewBox'), '0 0 100 100');
assert.equal(svg.children.some((child) => child.tagName === 'TEXT' && child.textContent === 'G'), true);

const smallIcon = createLineIconElement({ routeId: 'Seibu.Ikebukuro', code: 'SI', color: '#0099cc' });
const seibuSvg = smallIcon.querySelector('svg');
const seibuText = seibuSvg.children.find((child) => child.tagName === 'TEXT');
smallIcon.style.width = '20px';
smallIcon.style.height = '20px';
assert.equal(seibuSvg.getAttribute('viewBox'), '0 0 100 100');
assert.equal(seibuText.getAttribute('transform'), 'translate(0 -35)');
assert.equal(smallIcon.style.width, '20px');
assert.equal(smallIcon.style.height, '20px');

console.log('line icon svg element smoke ok');

import assert from 'node:assert/strict';

import { enhancePanelLineHeaderIcons } from '../src/features/panel/panelLineHeaderEnhancer.js';

class FakeElement {
    constructor({ className = '', attributes = {} } = {}) {
        this._className = className;
        this.attributes = new Map(Object.entries(attributes));
        this.children = [];
        this.parentElement = null;
        this.style = {};
        this.closestHandler = null;
        this.querySelectorHandler = null;
        this.querySelectorAllHandler = null;
        this.nextSibling = null;
    }

    get className() {
        return this._className;
    }

    set className(value) {
        this._className = String(value || '');
    }

    get classList() {
        return {
            contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name)
        };
    }

    appendChild(child) {
        if (!child) return child;
        child.parentElement = this;
        this.children.push(child);
        this.syncSiblings();
        return child;
    }

    prepend(child) {
        if (!child) return;
        if (child.__isFragment) {
            for (const fragmentChild of child.children.slice().reverse()) {
                this.prepend(fragmentChild);
            }
            return;
        }
        child.parentElement = this;
        this.children.unshift(child);
        this.syncSiblings();
    }

    insertBefore(child, beforeChild) {
        const index = this.children.indexOf(beforeChild);
        if (index < 0) return this.appendChild(child);
        child.parentElement = this;
        this.children.splice(index, 0, child);
        this.syncSiblings();
        return child;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || '';
    }

    closest(selector) {
        return typeof this.closestHandler === 'function' ? this.closestHandler(selector) : null;
    }

    querySelector(selector) {
        if (typeof this.querySelectorHandler === 'function') {
            const handled = this.querySelectorHandler(selector);
            if (handled !== undefined) return handled;
        }
        return this.children.find((child) => {
            if (selector === '.rw-line-icon') return child.classList.contains('rw-line-icon');
            if (selector === '.rw-station-code-badge') return child.classList.contains('rw-station-code-badge');
            if (selector === '.panel-line-name-suffix') return child.classList.contains('panel-line-name-suffix');
            if (selector === '.panel-line-name-main') return child.classList.contains('panel-line-name-main');
            return false;
        }) || null;
    }

    querySelectorAll(selector) {
        if (typeof this.querySelectorAllHandler === 'function') {
            return this.querySelectorAllHandler(selector);
        }
        return [];
    }

    syncSiblings() {
        for (let index = 0; index < this.children.length; index += 1) {
            this.children[index].nextSibling = this.children[index + 1] || null;
        }
    }
}

class FakeHTMLElement extends FakeElement {}

globalThis.Element = FakeElement;
globalThis.HTMLElement = FakeHTMLElement;

const createFragment = () => ({
    __isFragment: true,
    children: [],
    appendChild(child) {
        this.children.push(child);
    }
});

const throughNameEl = new FakeHTMLElement({ className: 'panel-line-name' });
const throughLineEl = new FakeElement({
    className: 'panel-line',
    attributes: { 'data-line-id': 'temp-line' }
});
throughNameEl.closestHandler = (selector) => selector === '.panel-line' ? throughLineEl : null;

const regularNameEl = new FakeHTMLElement({
    className: 'panel-line-name',
    attributes: { 'data-transfer-station-code': 'ST01' }
});
const regularLineEl = new FakeElement({
    className: 'panel-line',
    attributes: { 'data-line-id': 'line-regular' }
});
const suffixRowEl = new FakeElement({ className: 'panel-suffix-row' });
const suffixEl = new FakeElement({ className: 'panel-line-name-suffix' });
const mainEl = new FakeElement({ className: 'panel-line-name-main' });
regularNameEl.appendChild(mainEl);
regularNameEl.appendChild(suffixEl);
regularNameEl.closestHandler = (selector) => selector === '.panel-line' ? regularLineEl : null;
regularNameEl.querySelectorHandler = (selector) => {
    if (selector === '.panel-line-name-suffix') return suffixEl;
    if (selector === '.panel-line-name-main') return mainEl;
    return undefined;
};
regularLineEl.querySelectorHandler = (selector) => {
    if (selector === '[data-line-suffix-row]') return suffixRowEl;
    if (selector === '.panel-station-info-left') return null;
    return undefined;
};
suffixRowEl.querySelectorHandler = (selector) => {
    if (selector === '.panel-line-name-suffix') return suffixRowEl.children.find((child) => child === suffixEl) || null;
    if (selector === '.rw-station-code-badge') {
        return suffixRowEl.children.find((child) => child.classList.contains('rw-station-code-badge')) || null;
    }
    return undefined;
};

const rootEl = new FakeElement();
rootEl.querySelectorAllHandler = (selector) => selector === '.panel-line-name' ? [throughNameEl, regularNameEl] : [];

const createdIcons = [];
const createdBadges = [];
const resolvedMetaCalls = [];

await enhancePanelLineHeaderIcons(rootEl, {
    documentRef: {
        createDocumentFragment: createFragment
    },
    ElementRef: FakeElement,
    HTMLElementRef: FakeHTMLElement,
    throughServiceConfigs: [{
        tempId: 'temp-line',
        codes: ['JU', 'JT'],
        routeIds: ['route-ju', 'route-jt'],
        color: '#0a0'
    }],
    createLineIconElement: ({ routeId, code }) => {
        const icon = new FakeElement({ className: 'rw-line-icon' });
        icon.setAttribute('data-route-id', routeId);
        icon.setAttribute('data-code', code);
        createdIcons.push(icon);
        return icon;
    },
    createStationCodeBadgeElement: ({ code }) => {
        const badge = new FakeElement({ className: 'rw-station-code-badge' });
        badge.setAttribute('data-code', code);
        createdBadges.push(badge);
        return badge;
    },
    getResolvedRouteIconMeta: async (lineId) => {
        resolvedMetaCalls.push(lineId);
        if (lineId === 'line-regular') {
            return { id: 'route-regular', code: 'RG', color: '#123456' };
        }
        return null;
    }
});

assert.equal(createdIcons.length, 3);
assert.equal(throughNameEl.children.filter((child) => child.classList.contains('rw-line-icon')).length, 2);
assert.equal(throughNameEl.children[0].style.marginRight, '3px');
assert.equal(throughNameEl.children[1].style.marginRight, '4px');

assert.deepEqual(resolvedMetaCalls, ['line-regular']);
assert.equal(regularNameEl.children[0].classList.contains('rw-line-icon'), true);
assert.equal(createdBadges.length, 1);
assert.equal(suffixRowEl.children[0].classList.contains('rw-station-code-badge'), true);
assert.equal(suffixRowEl.children[1], suffixEl);

console.log('panel line header enhancer smoke ok');

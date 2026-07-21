import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getAboutNoticeModel } from '../src/config/aboutNotices.js';
import { openAboutDialog } from '../src/ui/aboutDialogView.js';

class FakeElement {
    constructor(tagName, ownerDocument = null) {
        this.tagName = String(tagName || '').toUpperCase();
        this.ownerDocument = ownerDocument;
        this.attributes = {};
        this.children = [];
        this.eventListeners = new Map();
        this.parentElement = null;
        this.parentNode = null;
        this.textContent = '';
        this._classes = new Set();
    }

    set id(value) {
        this.attributes.id = String(value);
    }

    get id() {
        return this.attributes.id || '';
    }

    set className(value) {
        this.attributes.class = value;
        this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
    }

    get className() {
        return this.attributes.class || '';
    }

    get classList() {
        return {
            contains: (name) => this._classes.has(name)
        };
    }

    set href(value) {
        this.attributes.href = value;
    }

    set target(value) {
        this.attributes.target = value;
    }

    set rel(value) {
        this.attributes.rel = value;
    }

    set tabIndex(value) {
        this.attributes.tabindex = String(value);
    }

    set type(value) {
        this.attributes.type = String(value);
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    appendChild(child) {
        child.parentElement = this;
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (!this.parentElement?.children) return;
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        this.parentElement = null;
        this.parentNode = null;
    }

    addEventListener(type, handler) {
        if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
        this.eventListeners.get(type).push(handler);
    }

    dispatchEvent(event) {
        event.target ||= this;
        for (const handler of this.eventListeners.get(event.type) || []) {
            handler(event);
        }
    }

    focus() {
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }
}

class FakeDocument {
    constructor() {
        this.eventListeners = new Map();
        this.body = new FakeElement('body', this);
        this.activeElement = null;
    }

    createElement(tagName) {
        return new FakeElement(tagName, this);
    }

    getElementById(id) {
        const visit = (node) => {
            if (node.id === id) return node;
            for (const child of node.children) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this.body);
    }

    addEventListener(type, handler) {
        if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
        this.eventListeners.get(type).push(handler);
    }

    removeEventListener(type, handler) {
        const handlers = this.eventListeners.get(type) || [];
        this.eventListeners.set(type, handlers.filter((item) => item !== handler));
    }

    dispatchEvent(event) {
        for (const handler of this.eventListeners.get(event.type) || []) {
            handler(event);
        }
    }
}

const collectText = (node) => `${node?.textContent || ''}${(node?.children || []).map(collectText).join('')}`;

const collectAnchors = (node, out = []) => {
    if (node?.tagName === 'A') out.push(node);
    for (const child of node?.children || []) collectAnchors(child, out);
    return out;
};

const model = getAboutNoticeModel();
assert.equal(model.project.name, 'TokyoRailMap');
assert.equal(model.project.copyright, 'Copyright (c) 2026 Blysh');
assert.equal(model.project.license, 'MIT License');
assert.ok(model.libraries.some((item) => item.name === 'MapLibre GL JS' && item.license === 'BSD-3-Clause'));
assert.ok(model.libraries.some((item) => item.name === 'JSZip' && /MIT/.test(item.license) && /GPL/.test(item.license)));
assert.ok(model.libraries.some((item) => item.name === 'Lucide' && item.license === 'ISC'));
assert.ok(model.dataSources.some((item) => item.name === 'OpenStreetMap contributors'));
assert.equal(model.dataSources.some((item) => item.name === 'CARTO'), false);
assert.ok(model.dataSources.some((item) => item.name === 'FareMapTokyo'));
assert.ok(model.dataSources.some((item) => item.name === 'TokyoGTFS'));

const doc = new FakeDocument();
const controller = openAboutDialog({ doc, model });
assert.ok(controller);
assert.equal(doc.body.children.length, 1);
assert.match(controller.overlay.className, /about-dialog-overlay/);
assert.match(controller.dialog.className, /about-dialog/);
assert.match(collectText(controller.overlay), /地图与数据来源/);
assert.match(collectText(controller.overlay), /开源库 License/);
assert.match(collectText(controller.overlay), /MIT License/);
assert.doesNotMatch(collectText(controller.overlay), /感谢 MapLibre/);

const anchors = collectAnchors(controller.overlay);
assert.ok(anchors.length > 4);
assert.ok(anchors.every((anchor) => anchor.attributes.target === '_blank'));
assert.ok(anchors.every((anchor) => anchor.attributes.rel === 'noopener noreferrer'));

const secondController = openAboutDialog({ doc, model });
assert.equal(secondController, controller);
assert.equal(doc.body.children.length, 1);

doc.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault: () => {}
});
assert.equal(doc.body.children.length, 0);

const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
assert.match(cssSource, /\.about-dialog-overlay/);
assert.match(cssSource, /html\[data-theme='dark'\][\s\S]*\.about-dialog/);
assert.match(cssSource, /html\[data-mobile-ui='1'\][\s\S]*\.about-dialog-overlay/);

console.log('about dialog view smoke ok');

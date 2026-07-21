import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    applyAttributionExpandedState,
    installMapAttributionView,
    renderMapAttributionInner
} from '../src/ui/mapAttributionView.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || '').toUpperCase();
        this.attributes = {};
        this.children = [];
        this.textContent = '';
        this.parentElement = null;
        this.parentNode = null;
        this._classes = new Set();
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
            add: (...names) => {
                names.forEach((name) => this._classes.add(name));
                this.attributes.class = Array.from(this._classes).join(' ');
            },
            contains: (name) => this._classes.has(name),
            remove: (...names) => {
                names.forEach((name) => this._classes.delete(name));
                this.attributes.class = Array.from(this._classes).join(' ');
            },
            toggle: (name, force) => {
                const shouldAdd = force === undefined ? !this._classes.has(name) : Boolean(force);
                if (shouldAdd) this._classes.add(name);
                else this._classes.delete(name);
                this.attributes.class = Array.from(this._classes).join(' ');
                return shouldAdd;
            }
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

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    appendChild(child) {
        child.parentElement = this;
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    append(...children) {
        children.forEach((child) => this.appendChild(child));
    }

    remove() {
        if (!this.parentElement?.children) return;
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        this.parentElement = null;
        this.parentNode = null;
    }

    replaceChildren(...children) {
        children.forEach((child) => {
            child.parentElement = this;
            child.parentNode = this;
        });
        this.children = children;
    }

    querySelector(selector) {
        const selectors = selector.split(',').map((item) => item.trim()).filter(Boolean);
        const matches = (node, singleSelector) => {
            if (singleSelector.startsWith('.')) {
                return node.classList.contains(singleSelector.slice(1));
            }
            return node.tagName === singleSelector.toUpperCase();
        };
        const visit = (node) => {
            if (selectors.some((singleSelector) => matches(node, singleSelector))) return node;
            for (const child of node.children || []) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this);
    }
}

const collectText = (node) => {
    if (!node) return '';
    return `${node.textContent || ''}${(node.children || []).map(collectText).join('')}`;
};

const collectHrefs = (node, out = []) => {
    if (node?.attributes?.href) out.push(node.attributes.href);
    for (const child of node?.children || []) collectHrefs(child, out);
    return out;
};

const fakeDoc = {
    createElement: (tagName) => new FakeElement(tagName)
};
const inner = new FakeElement('span');

assert.equal(renderMapAttributionInner(inner, { doc: fakeDoc }), true);
assert.equal(inner.children.length, 1);
assert.match(inner.children[0].className, /map-attribution/);
assert.match(collectText(inner), /fare-map-tokyo/);
assert.match(collectText(inner), /mini-tokyo-3d/);
assert.doesNotMatch(collectText(inner), /OpenStreetMap/);
assert.ok(collectHrefs(inner).includes('https://github.com/fksms/FareMapTokyo'));
assert.ok(collectHrefs(inner).includes('https://github.com/nagix/mini-tokyo-3d'));

assert.equal(renderMapAttributionInner(inner, {
    doc: fakeDoc,
    mapAttributionItems: [
        { group: 'map', label: 'OpenMapTiles', href: 'https://www.openmaptiles.org/' },
        { group: 'map', label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' }
    ]
}), true);
assert.match(collectText(inner), /OpenMapTiles/);
assert.match(collectText(inner), /OpenStreetMap/);
assert.ok(collectHrefs(inner).includes('https://www.openmaptiles.org/'));
assert.ok(collectHrefs(inner).includes('https://www.openstreetmap.org/copyright'));

const control = new FakeElement('div');
control.className = 'tokyo-map-attribution-control';
const button = new FakeElement('button');
button.className = 'tokyo-map-attribution-toggle';
control.appendChild(button);

assert.equal(applyAttributionExpandedState(control, false), true);
assert.equal(control.getAttribute('data-map-attribution-expanded'), '0');
assert.equal(control.classList.contains('is-expanded'), false);
assert.equal(button.getAttribute('aria-expanded'), 'false');

assert.equal(applyAttributionExpandedState(control, true), true);
assert.equal(control.getAttribute('data-map-attribution-expanded'), '1');
assert.equal(control.classList.contains('is-expanded'), true);
assert.equal(button.getAttribute('aria-expanded'), 'true');

const mapHost = new FakeElement('div');
const fakeInstallDoc = {
    body: new FakeElement('body'),
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => (id === 'map' ? mapHost : null)
};
const attributionView = installMapAttributionView({
    doc: fakeInstallDoc,
    isCompact: () => true,
    getMapAttributionItems: () => [
        { group: 'map', label: 'OpenMapTiles', href: 'https://www.openmaptiles.org/' },
        { group: 'map', label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' }
    ]
});
const installed = attributionView.getElement();
assert.equal(mapHost.children.includes(installed), true);
assert.match(installed.className, /tokyo-map-attribution-control/);
assert.equal(installed.getAttribute('data-map-attribution-mobile'), '1');
assert.equal(installed.getAttribute('data-map-attribution-expanded'), '0');
assert.match(collectText(installed), /fare-map-tokyo/);
assert.match(collectText(installed), /OpenMapTiles/);
assert.match(collectText(installed), /OpenStreetMap/);

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
assert.match(appSource, /getMapAttributionItems:\s*\(\)\s*=>\s*basemapThemeRuntime\.getMapAttributionItems/);
assert.doesNotMatch(appSource, /maplibregl-ctrl-attrib-inner[\s\S]*innerHTML/);

const mapEngineSource = readFileSync(join(process.cwd(), 'src/services/mapEngine.js'), 'utf8');
assert.match(mapEngineSource, /attributionControl:\s*false/);

const appCss = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
assert.match(appCss, /tokyo-map-attribution-control\[data-map-attribution-mobile='1'\]\[data-map-attribution-expanded='0'\][\s\S]*?tokyo-map-attribution-inner[\s\S]*?display:\s*none/);
assert.match(appCss, /\.tokyo-map-attribution-control\s*\{[\s\S]*?right:\s*10px/);

console.log('map attribution view smoke ok');

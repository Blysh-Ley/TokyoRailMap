import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderMapAttributionInner } from '../src/ui/mapAttributionView.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.attributes = {};
        this.children = [];
        this.textContent = '';
    }

    set className(value) {
        this.attributes.class = value;
    }

    get className() {
        return this.attributes.class || '';
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

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children = children;
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
assert.ok(collectHrefs(inner).includes('https://github.com/fksms/FareMapTokyo'));
assert.ok(collectHrefs(inner).includes('https://github.com/nagix/mini-tokyo-3d'));

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
assert.match(appSource, /installMapAttributionView\(\{ mapEngine, isCompact: isMobileUiMode \}\)/);
assert.doesNotMatch(appSource, /maplibregl-ctrl-attrib-inner[\s\S]*innerHTML/);

console.log('map attribution view smoke ok');

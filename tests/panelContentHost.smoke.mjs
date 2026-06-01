import assert from 'node:assert/strict';

import { createPanelContentHost } from '../src/features/panel/panelContentHost.js';

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.children = [];
        this.className = '';
        this.parent = null;
        this.style = {};
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }
}

const documentRef = {
    createElement: (tagName) => new FakeElement(tagName)
};

const host = new FakeElement('section');
const contentHost = createPanelContentHost({ documentRef });

assert.equal(contentHost.panel.className, 'panel-container');
assert.equal(contentHost.panel.style.marginTop, '0');
assert.equal(contentHost.panel.style.maxHeight, 'none');
assert.equal(contentHost.panel.style.height, '100%');
assert.equal(contentHost.panel.style.opacity, '1');
assert.equal(contentHost.panel.style.overflow, 'hidden');
assert.equal(contentHost.panel.style.display, 'flex');
assert.equal(contentHost.panel.style.flexDirection, 'column');

assert.equal(contentHost.mount(host), true);
assert.equal(host.children[0], contentHost.panel);
assert.equal(contentHost.panel.parent, host);

console.log('panel content host smoke ok');

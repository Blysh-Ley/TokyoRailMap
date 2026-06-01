import assert from 'node:assert/strict';

import {
    composePanelShellWithContent,
    createPanelContentApi
} from '../src/features/panel/panelContentApi.js';
import { createDesktopPanelShell } from '../src/features/panel/panelShellDesktop.js';

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.attributes = new Map();
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

    contains(target) {
        if (!target) return false;
        if (target === this) return true;
        return this.children.some((child) => child.contains?.(target));
    }

    setAttribute(name, value) {
        this.attributes.set(name, value);
    }
}

const documentRef = {
    createElement: (tagName) => new FakeElement(tagName)
};

const shell = createDesktopPanelShell({
    documentRef,
    win: { innerHeight: 900 },
    rightPx: 12,
    widthPx: 320
});
const contentApi = createPanelContentApi({ documentRef });
const composition = composePanelShellWithContent({ contentApi, shell });

assert.equal(contentApi.kind, 'panel-content-api');
assert.equal(composition.root, shell.root);
assert.equal(composition.panel, contentApi.panel);
assert.equal(contentApi.panel.className, 'panel-container');

const header = new FakeElement('header');
const body = new FakeElement('main');
assert.equal(contentApi.appendContent(header), true);
assert.equal(contentApi.appendContent(body), true);
assert.deepEqual(contentApi.panel.children, [header, body]);

assert.equal(composition.mountContent(), true);
assert.equal(shell.root.children[0], contentApi.panel);
assert.equal(shell.contains(body), true);

const catalogOverlay = new FakeElement('aside');
assert.equal(composition.mountShellOverlay(catalogOverlay), true);
assert.equal(shell.root.children[1], catalogOverlay);

shell.layout();
shell.show();
assert.equal(shell.isVisible(), true);
assert.equal(shell.root.style.transform, 'translateX(0)');

console.log('panel content api smoke ok');

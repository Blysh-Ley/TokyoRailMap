import assert from 'node:assert/strict';

import { createDesktopPanelShell } from '../src/features/panel/panelShellDesktop.js';

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.attributes = new Map();
        this.children = [];
        this.parent = null;
        this.style = {};
        this.selectorMatches = new Set();
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    contains(target) {
        if (!target) return false;
        if (target === this) return true;
        return this.children.some((child) => child.contains(target));
    }

    closest(selector) {
        let node = this;
        while (node) {
            if (node.selectorMatches?.has(selector)) return node;
            node = node.parent;
        }
        return null;
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
    win: { innerHeight: 1000 },
    rightPx: 12,
    widthPx: 320
});

assert.equal(shell.root.style.position, 'fixed');
assert.equal(shell.root.style.right, '12px');
assert.equal(shell.root.style.width, '320px');
assert.equal(shell.root.style.transform, 'translateX(calc(100% + 24px))');
assert.equal(shell.isVisible(), false);

assert.deepEqual(shell.layout(), { top: 100, height: 800 });
assert.equal(shell.root.style.top, '100px');
assert.equal(shell.root.style.height, '800px');

shell.show();
assert.equal(shell.isVisible(), true);
assert.equal(shell.root.style.transform, 'translateX(0)');

shell.hide();
assert.equal(shell.isVisible(), false);
assert.equal(shell.root.style.transform, 'translateX(calc(100% + 24px))');

const panelChild = new FakeElement();
shell.root.appendChild(panelChild);
assert.deepEqual(shell.getClickRegion(panelChild), {
    ignored: false,
    insideExtra: false,
    insidePanel: true,
    insidePanelOrExtra: true
});

const settingsNode = new FakeElement();
settingsNode.selectorMatches.add('.settings-ui');
assert.equal(
    shell.getClickRegion(settingsNode, { ignoredSelectors: ['.settings-ui'] }).ignored,
    true
);

const filterNode = new FakeElement();
assert.equal(
    shell.getClickRegion(filterNode, { insidePredicates: [(node) => node === filterNode] }).insidePanelOrExtra,
    true
);

console.log('panel shell desktop smoke ok');

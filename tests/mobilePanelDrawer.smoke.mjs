import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMobilePanelShell } from '../src/ui/panelShellView.js';

const createFakeElement = () => {
    const attrs = new Map();
    const children = [];
    const style = {
        setProperty(name, value) {
            this[name] = value;
        }
    };

    return {
        children,
        classList: {
            toggle() {}
        },
        style,
        appendChild(child) {
            children.push(child);
            child.parentNode = this;
            return child;
        },
        contains(target) {
            return target === this || children.includes(target);
        },
        getAttribute(name) {
            return attrs.get(name) || null;
        },
        removeAttribute(name) {
            attrs.delete(name);
        },
        setAttribute(name, value) {
            attrs.set(name, String(value));
        }
    };
};

const shell = createMobilePanelShell({
    documentRef: { createElement: createFakeElement },
    win: { innerHeight: 1000 }
});

shell.layout();
assert.equal(shell.root.style.height, '880px');
assert.equal(shell.root.getAttribute('data-panel-mobile-state'), 'hidden');

shell.show();
assert.equal(shell.isVisible(), true);
assert.equal(shell.isCollapsed(), false);
assert.equal(shell.getMobileState(), 'expanded');
assert.equal(shell.root.style.transform, 'translateY(0)');

assert.equal(shell.beginMobileDrag(), true);
assert.equal(shell.updateMobileDrag(120), true);
assert.equal(shell.endMobileDrag(120), 'collapsed');
assert.equal(shell.isVisible(), true);
assert.equal(shell.isCollapsed(), true);
assert.equal(shell.getMobileState(), 'collapsed');
assert.equal(shell.root.style.transform, 'translateY(794px)');

assert.equal(shell.beginMobileDrag(), true);
assert.equal(shell.updateMobileDrag(-120), true);
assert.equal(shell.endMobileDrag(-120), 'expanded');
assert.equal(shell.isCollapsed(), false);
assert.equal(shell.root.style.transform, 'translateY(0)');

shell.hide();
assert.equal(shell.isVisible(), false);
assert.equal(shell.getMobileState(), 'hidden');
assert.equal(shell.root.style.transform, 'translateY(calc(100% + 24px))');

const panelViewSource = readFileSync(join(process.cwd(), 'src/ui/panelMainView.js'), 'utf8');
const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');
const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');

assert.match(panelViewSource, /panelShell/);
assert.match(panelViewSource, /beginMobileDrag/);
assert.match(panelViewSource, /updateMobileDrag/);
assert.match(panelViewSource, /endMobileDrag/);
assert.match(panelViewSource, /lostpointercapture/);
assert.match(panelViewSource, /root\.addEventListener\('pointerup', finishDrag/);
assert.match(panelViewSource, /document\.addEventListener\('pointermove', updateDrag/);
assert.match(panelViewSource, /document\.addEventListener\('pointerup', finishDrag/);
assert.match(panelViewSource, /isInteractivePanelHeaderTarget/);
assert.doesNotMatch(panelViewSource, /panelShell\.hide\(\)/);
assert.match(panelViewSource, /body\.style\.minHeight\s*=\s*'0'/);
assert.match(panelViewSource, /body\.style\.touchAction\s*=\s*'pan-y'/);

assert.match(panelSource, /createPanelMainView\(\{[\s\S]*panelShell,/);
assert.match(cssSource, /\[data-panel-root\]\[data-panel-presentation='mobile'\] \[data-panel-header\]::before/);
assert.match(cssSource, /background:\s*var\(--ui-border-strong\)/);
assert.match(cssSource, /\.settings-top-timebar\.is-panel-drawer-collapsed/);

console.log('mobile panel drawer smoke ok');

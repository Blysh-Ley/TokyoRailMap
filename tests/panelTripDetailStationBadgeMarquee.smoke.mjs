import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class TestElement {
    constructor(tagName) {
        this.tagName = tagName.toLowerCase();
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
        const queue = [...this.children];
        while (queue.length) {
            const child = queue.shift();
            if (String(child.className).split(/\s+/).includes(className)) return child;
            queue.push(...(child.children || []));
        }
        return null;
    }

    get outerHTML() {
        const attrs = [];
        if (this.className) attrs.push(`class="${this.className}"`);
        for (const [key, value] of Object.entries(this.dataset)) {
            attrs.push(`data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${value}"`);
        }
        const content = this.children.length
            ? this.children.map((child) => child.outerHTML).join('')
            : this.textContent;
        return `<${this.tagName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${content}</${this.tagName}>`;
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

const { renderPanelTripDetailStationCellHtml } = await import('../src/features/panel/panelTripDetailStationRenderer.js');

const html = renderPanelTripDetailStationCellHtml({
    className: 'panel-trip-detail-station',
    dataStationId: 'station-1',
    lineColor: '#ff6600',
    stationCode: 'SI11',
    stationName: 'Shinjuku Very Long Station',
    stationId: 'station-1'
});

assert.match(html, /class="panel-trip-detail-station"/);
assert.match(html, /data-station-id="station-1"/);
assert.match(html, /rw-station-code-badge/);
assert.match(html, /rw-station-code-badge-prefix[^>]*>SI</);
assert.match(html, /rw-station-code-badge-suffix[^>]*>11</);
assert.match(html, /panel-trip-detail-station-marquee/);
assert.match(html, /panel-trip-detail-station-name/);
assert.match(html, /Shinjuku Very Long Station/);
assert.doesNotMatch(html, /SI11 Shinjuku Very Long Station/);

const panelSource = readFileSync('src/features/panel/panel.js', 'utf8');
const cssSource = readFileSync('index.html', 'utf8');

assert.match(panelSource, /scheduleMarqueeApply\(tripDetailRoot\)/);
assert.match(panelSource, /html\.\$\{EXPORT_CLASS\} \.panel-trip-detail \{/);
assert.match(panelSource, /width: max-content !important;/);
assert.match(cssSource, /max-width: min\(300px, calc\(100vw - 40px\)\);/);

console.log('panel trip detail station badge marquee smoke ok');

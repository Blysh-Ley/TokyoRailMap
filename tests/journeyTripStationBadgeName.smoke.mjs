import assert from 'node:assert/strict';

class TestElement {
    constructor(tagName) {
        this.tagName = tagName.toLowerCase();
        this.className = '';
        this.textContent = '';
        this.dataset = {};
        this.style = {};
        this.attributes = {};
        this.children = [];
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
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

    get innerText() {
        return this.textContent + this.children.map((child) => child.innerText).join('');
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

const { createJourneyTripStationRow } = await import('../src/features/search/journeyPlanRenderer.js');

const row = createJourneyTripStationRow({
    arrivalText: '10:00',
    departureText: '10:01',
    lineColor: '#ff6600',
    stationCode: 'SI11',
    stationId: 'station-1',
    stationName: 'Shinjuku'
});

const station = row.querySelector('.journey-trip-station');
const badge = row.querySelector('.rw-station-code-badge');
const name = row.querySelector('.journey-trip-station-name');

assert.equal(row.className, 'journey-trip-row');
assert.equal(station.attributes['data-station-id'], 'station-1');
assert.equal(badge.querySelector('.rw-station-code-badge-prefix').textContent, 'SI');
assert.equal(badge.querySelector('.rw-station-code-badge-suffix').textContent, '11');
assert.equal(name.textContent, 'Shinjuku');
assert.notEqual(station.innerText, 'SI11 Shinjuku');

console.log('journey trip station badge name smoke ok');

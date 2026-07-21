import assert from 'node:assert/strict';
import { createStationLabelChipsAdapter } from '../src/ui/layer/stationLabelChipsAdapter.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.className = '';
        this.style = {};
        this.textContent = '';
        this.innerHTML = '';
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    querySelector(selector) {
        const className = String(selector || '').replace(/^\./, '');
        return this.children.find((child) => child.className === className) || null;
    }
}

const createElement = (tagName) => new FakeElement(tagName);

{
    const root = new FakeElement('div');
    root.textContent = 'Station A';
    const stationLabels = [{
        el: root,
        props: { id: 'S1', name: 'Station A' },
        servingLineIds: ['L1'],
        stationId: 'S1'
    }];

    const adapter = createStationLabelChipsAdapter({
        createElement,
        getLineColor: () => '#00aa00',
        getTransferStationIds: () => null,
        resolveRailColor: (color) => color,
        stationLabels
    });

    adapter.render({ activeLineIds: ['L1'], showIcons: true });

    const nameEl = root.querySelector('.station-label-name');
    const rowEl = root.querySelector('.station-label-multi-row');
    assert.equal(nameEl.textContent, 'Station A');
    assert.equal(rowEl.children.length, 1);
    assert.equal(rowEl.children[0].children[0].className, 'station-label-multi-chip');
    assert.equal(rowEl.children[0].children[0].style.backgroundColor, '#00aa00');

    adapter.render({ activeLineIds: [], showIcons: true });
    assert.equal(root.textContent, 'Station A');
}

{
    const root = new FakeElement('div');
    root.textContent = 'Station B';
    const stationLabels = [{
        el: root,
        props: { id: 'S2', name: 'Station B' },
        servingLineIds: ['L2'],
        stationId: 'S2'
    }];

    const adapter = createStationLabelChipsAdapter({
        createElement,
        getLineColor: (lineId) => lineId === 'L3' ? '#333333' : '#222222',
        getTransferStationIds: () => null,
        resolveRailColor: (color) => `resolved:${color}`,
        stationLabels
    });

    adapter.render({
        activeLineIds: [],
        showIcons: true,
        visibleTripSelections: [{
            payload: {
                segments: [{ lineId: 'L3', stationIds: ['S2'], typeColor: '#ff0000' }]
            }
        }]
    });

    const rowEl = root.querySelector('.station-label-multi-row');
    const cluster = rowEl.children[0];
    assert.equal(cluster.children[0].style.backgroundColor, 'resolved:#333333');
    assert.equal(cluster.children[1].className, 'station-label-multi-type-dot');
    assert.equal(cluster.children[1].style.backgroundColor, 'resolved:#ff0000');

    adapter.render({ activeLineIds: ['L2'], showIcons: false });
    assert.equal(root.textContent, 'Station B');
}

console.log('station label chips adapter smoke ok');

import assert from 'node:assert/strict';

import {
    findPanelTripTarget,
    resolvePanelInteractionKeyFromTarget,
    resolvePanelMousePrimaryTarget
} from '../src/features/panel/panelIntentTargetParser.js';

class FakeElement {
    constructor() {
        this._closest = new Map();
        this.attributes = new Map();
    }

    setClosest(selector, value) {
        this._closest.set(selector, value);
    }

    closest(selector) {
        return this._closest.get(selector) || null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || '';
    }
}

globalThis.Element = FakeElement;

const rowEl = new FakeElement();
rowEl.setAttribute('data-trip-key', 'trip-1');
const lineEl = new FakeElement();
lineEl.setAttribute('data-line-id', 'JR.Main');
rowEl.setClosest('[data-line-id]', lineEl);

const target = new FakeElement();
target.setClosest('.panel-timetable-row[data-trip-key], .panel-grid-cell[data-trip-key]', rowEl);

assert.equal(findPanelTripTarget(target), rowEl);

const interactionKey = resolvePanelInteractionKeyFromTarget(target, {
    body: { contains: (el) => el === rowEl },
    makeLineDirKey: (lineId, dirKey) => `${lineId}||${dirKey}`
});
assert.equal(interactionKey, 'trip:JR.Main||trip-1');

const mousePrimary = resolvePanelMousePrimaryTarget({}, {
    getDirTitleTarget: () => ({ lineId: 'JR.Main', dirKey: 'north' }),
    makeLineDirKey: (lineId, dirKey) => `${lineId}||${dirKey}`
});
assert.deepEqual(mousePrimary, {
    kind: 'dir',
    key: 'dir:JR.Main||north',
    lineId: 'JR.Main',
    dirKey: 'north',
    lineDirKey: 'JR.Main||north'
});

const companyPrimary = resolvePanelMousePrimaryTarget({}, {
    getDirTitleTarget: () => null,
    getLineTarget: () => '',
    getCompanyTarget: () => 'JR'
});
assert.deepEqual(companyPrimary, {
    kind: 'company',
    key: 'company:JR',
    companyName: 'JR'
});

console.log('panel intent target parser smoke ok');

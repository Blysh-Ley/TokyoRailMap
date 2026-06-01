import assert from 'node:assert/strict';
import {
    createPanelEventDelegationCoordinator,
    resolvePanelCompanyTarget,
    resolvePanelDirFilterButtonTarget,
    resolvePanelDirPrintButtonTarget,
    resolvePanelDirTitleTarget,
    resolvePanelDirTriangleTarget,
    resolvePanelLineTarget,
    resolveTripDetailStationTarget
} from '../src/features/panel/panelEventDelegationCoordinator.js';

const body = {
    contains: (node) => node?.insideBody === true
};

const companyHeader = {
    insideBody: true,
    getAttribute: (name) => (name === 'data-company' ? ' JR ' : '')
};
const companyName = {
    insideBody: true,
    closest: (selector) => {
        if (selector === '.panel-company-logo, .panel-company-name') return companyName;
        if (selector === '.panel-company-header[data-company]') return companyHeader;
        return null;
    }
};
assert.equal(resolvePanelCompanyTarget(companyName, { body }), 'JR');

const lineRoot = {
    insideBody: true,
    getAttribute: (name) => (name === 'data-line-id' ? ' L1 ' : '')
};
const lineName = {
    insideBody: true,
    closest: (selector) => {
        if (selector === '.panel-line-name') return lineName;
        if (selector === '[data-line-id]') return lineRoot;
        return null;
    }
};
assert.equal(resolvePanelLineTarget(lineName, { body }), 'L1');

const dirToggle = {
    getAttribute: (name) => (name === 'data-dir-key' ? 'D1' : '')
};
const dirLine = {
    getAttribute: (name) => (name === 'data-line-id' ? 'L1' : '')
};
const makeDirTrigger = (selectorName) => ({
    insideBody: true,
    closest: (selector) => {
        if (selector === selectorName) return makeDirTrigger(selectorName);
        if (selector === '[data-dir-toggle]') return dirToggle;
        if (selector === '[data-line-id]') return dirLine;
        return null;
    }
});

assert.deepEqual(resolvePanelDirTitleTarget(makeDirTrigger('.panel-dir-title'), { body }), {
    dirKey: 'D1',
    lineId: 'L1'
});
assert.deepEqual(resolvePanelDirTriangleTarget(makeDirTrigger('.panel-dir-triangle'), { body }), {
    dirKey: 'D1',
    lineId: 'L1'
});

const makeDirButton = (selectorName) => ({
    insideBody: true,
    getAttribute: (name) => {
        if (name === 'data-line-id') return ' L2 ';
        if (name === 'data-dir-key') return ' D2 ';
        return '';
    },
    closest: (selector) => (selector === selectorName ? makeDirButton(selectorName) : null)
});

const filterButtonTarget = resolvePanelDirFilterButtonTarget(makeDirButton('.panel-dir-filter-btn[data-dir-filter-btn]'), { body });
assert.equal(filterButtonTarget.lineId, 'L2');
assert.equal(filterButtonTarget.dirKey, 'D2');
assert.ok(filterButtonTarget.buttonEl);

const printButtonTarget = resolvePanelDirPrintButtonTarget(makeDirButton('.panel-dir-print-btn[data-dir-print-btn]'), { body });
assert.equal(printButtonTarget.lineId, 'L2');
assert.equal(printButtonTarget.dirKey, 'D2');
assert.ok(printButtonTarget.buttonEl);

const tripRoot = { contains: (node) => node?.insideTrip === true };
const makeTripStation = (insideTrip) => {
    const node = {
        insideTrip,
        closest: (selector) => (selector === '.panel-trip-detail-station[data-station-id]' ? node : null)
    };
    return node;
};
const tripStation = makeTripStation(true);
assert.equal(resolveTripDetailStationTarget(tripStation, { rootEl: tripRoot }), tripStation);
assert.equal(resolveTripDetailStationTarget(makeTripStation(false), { rootEl: tripRoot }), null);

const createFakeTarget = () => {
    const listeners = [];
    return {
        listeners,
        addEventListener(type, handler, options) {
            listeners.push({ handler, options, removed: false, type });
        },
        removeEventListener(type, handler) {
            const hit = listeners.find((entry) => entry.type === type && entry.handler === handler && !entry.removed);
            if (hit) hit.removed = true;
        }
    };
};

const fakeBody = createFakeTarget();
const fakeTripDetail = createFakeTarget();
const calls = [];
const coordinator = createPanelEventDelegationCoordinator({
    body: fakeBody,
    bodyHandlers: {
        click: () => calls.push('body-click'),
        mouseover: () => calls.push('body-over'),
        pointerdown: () => calls.push('body-pointer')
    },
    tripDetailBody: fakeTripDetail,
    tripDetailHandlers: {
        mouseleave: () => calls.push('trip-leave'),
        pointerdown: () => calls.push('trip-pointer')
    }
});

assert.ok(fakeBody.listeners.some((entry) => entry.type === 'click' && entry.options?.passive === false));
assert.ok(fakeBody.listeners.some((entry) => entry.type === 'pointerdown' && entry.options?.passive === false));
assert.ok(fakeTripDetail.listeners.some((entry) => entry.type === 'pointerdown' && entry.options?.passive === true));

fakeBody.listeners.find((entry) => entry.type === 'click').handler({});
fakeTripDetail.listeners.find((entry) => entry.type === 'mouseleave').handler({});
assert.deepEqual(calls, ['body-click', 'trip-leave']);

coordinator.destroy();
assert.equal(fakeBody.listeners.every((entry) => entry.removed), true);
assert.equal(fakeTripDetail.listeners.every((entry) => entry.removed), true);

console.log('panel event delegation coordinator smoke ok');

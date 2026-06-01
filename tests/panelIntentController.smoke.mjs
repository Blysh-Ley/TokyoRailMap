import assert from 'node:assert/strict';

import { createPanelIntentController } from '../src/features/panel/panelIntentController.js';

const captureCalls = [];
const controller = createPanelIntentController({
    captureElement: async (root, filenameBase, buttonEl) => {
        captureCalls.push({ root, filenameBase, buttonEl });
    }
});

const tripDetailRoot = { id: 'trip-detail' };
const captureButton = { id: 'capture' };

assert.equal(await controller.captureTripDetail({
    root: tripDetailRoot,
    filenameBase: 'trip-detail-tokyo',
    buttonEl: captureButton
}), true);
assert.deepEqual(captureCalls, [{
    root: tripDetailRoot,
    filenameBase: 'trip-detail-tokyo',
    buttonEl: captureButton
}]);

const printCalls = [];
const printRequests = {
    requestDirectionTimetable(lineId, dirKey) {
        printCalls.push(['dir', lineId, dirKey]);
        return true;
    },
    requestAllTimetables() {
        printCalls.push(['all']);
        return true;
    }
};

assert.equal(controller.requestDirectionPrint(printRequests, 'L1', 'Outbound'), true);
assert.equal(controller.requestAllPrint(printRequests), true);
assert.deepEqual(printCalls, [
    ['dir', 'L1', 'Outbound'],
    ['all']
]);

const listeners = new Map();
const target = {
    addEventListener(name, handler) {
        listeners.set(name, handler);
    },
    removeEventListener(name, handler) {
        if (listeners.get(name) === handler) listeners.delete(name);
    }
};

const hoverCalls = [];
const unbind = controller.bindRouteMapPopoverHover(target, {
    onEnter: () => hoverCalls.push('enter'),
    onLeave: () => hoverCalls.push('leave')
});

listeners.get('__TokyoRailRouteMapPopoverHoverEnter')();
listeners.get('__TokyoRailRouteMapPopoverHoverLeave')();
assert.deepEqual(hoverCalls, ['enter', 'leave']);

unbind();
assert.equal(listeners.has('__TokyoRailRouteMapPopoverHoverEnter'), false);
assert.equal(listeners.has('__TokyoRailRouteMapPopoverHoverLeave'), false);

console.log('panel intent controller smoke ok');

import assert from 'node:assert/strict';

import { createPanelRoutePreviewController } from '../src/features/panel/panelRoutePreviewController.js';

const requestCalls = [];
const clearCalls = [];
const enterCalls = [];

const controller = createPanelRoutePreviewController({
    clearTripPathPreviewBySource: (source) => {
        clearCalls.push(source);
        return true;
    },
    requestRoutePreview: async (payload) => {
        requestCalls.push(payload);
    }
});

assert.equal(await controller.applyDirectionPreview({
    currentStationIds: ['S0'],
    fitMode: 'preview',
    key: 'L1||Outbound',
    meta: {
        lineId: 'L1',
        originStationIds: ['S1'],
        terminalStationIds: ['S2']
    },
    onEnter: (payload) => enterCalls.push(payload),
    sourceLineIds: ['L1.source'],
    targetTripKeys: ['trip-1'],
    throughServiceCategory: 'direct'
}), true);

assert.equal(controller.getActiveKey(), 'L1||Outbound');
assert.equal(enterCalls.length, 1);
assert.deepEqual(enterCalls[0].currentStationIds, ['S0']);
assert.deepEqual(requestCalls[0].highlightStationIds, ['S1', 'S2', 'S0']);
assert.equal(requestCalls[0].previewSource, 'panel-dir-branch');
assert.deepEqual(requestCalls[0].targetTripKeys, ['trip-1']);
assert.equal(requestCalls[0].throughServiceCategory, 'direct');

assert.equal(await controller.applyDirectionPreview({
    key: 'L1||Outbound',
    meta: { lineId: 'L1' }
}), false);
assert.equal(requestCalls.length, 1);

assert.equal(controller.clearDirectionPreview(), true);
assert.deepEqual(clearCalls, ['panel-dir-branch']);
assert.equal(controller.getActiveKey(), '');
assert.equal(controller.clearDirectionPreview(), false);

const staleClearCalls = [];
let rejectFirst;
let resolveSecond;
const staleController = createPanelRoutePreviewController({
    clearTripPathPreviewBySource: (source) => staleClearCalls.push(source),
    requestRoutePreview: (payload) => {
        if (payload.lineId === 'first') {
            return new Promise((_, reject) => {
                rejectFirst = reject;
            });
        }
        return new Promise((resolve) => {
            resolveSecond = resolve;
        });
    }
});

const first = staleController.applyDirectionPreview({
    key: 'first||dir',
    meta: { lineId: 'first' }
});
const second = staleController.applyDirectionPreview({
    key: 'second||dir',
    meta: { lineId: 'second' }
});
rejectFirst(new Error('stale failure'));
resolveSecond();
assert.equal(await first, false);
assert.equal(await second, true);
assert.deepEqual(staleClearCalls, []);

const failureClears = [];
const failingController = createPanelRoutePreviewController({
    clearTripPathPreviewBySource: (source) => failureClears.push(source),
    requestRoutePreview: async () => {
        throw new Error('current failure');
    }
});
assert.equal(await failingController.applyDirectionPreview({
    key: 'fail||dir',
    meta: { lineId: 'fail' }
}), true);
assert.deepEqual(failureClears, ['panel-dir-branch']);

console.log('panel route preview controller smoke ok');

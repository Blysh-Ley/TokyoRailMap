import assert from 'node:assert/strict';

import { createPanelHoverRestoreRuntime } from '../src/features/panel/panelHoverRestoreRuntime.js';

const timers = [];
const cleared = [];
let lastAppliedHoverKey = 'line:JR.Main';
const restoreCalls = [];

const runtime = createPanelHoverRestoreRuntime({
    restoreDelayMs: 80,
    setTimeoutFn: (callback, delayMs) => {
        const timer = { callback, delayMs };
        timers.push(timer);
        return timer;
    },
    clearTimeoutFn: (timer) => cleared.push(timer),
    getLastAppliedHoverKey: () => lastAppliedHoverKey,
    setLastAppliedHoverKey: (value) => {
        lastAppliedHoverKey = value;
    },
    onRestoreStationLines: (servingIds, options) => {
        restoreCalls.push({ servingIds, options });
    },
    getCurrentStationServingIds: () => ['JR.Main', 'JR.Main.Branch'],
    getCurrentStationId: () => 'station-a'
});

runtime.scheduleRestoreStationLines();
assert.equal(timers.length, 1);
assert.equal(timers[0].delayMs, 80);
timers[0].callback();
assert.deepEqual(restoreCalls, [{
    servingIds: ['JR.Main', 'JR.Main.Branch'],
    options: { stationId: 'station-a' }
}]);
assert.equal(lastAppliedHoverKey, null);

let hoverTriggered = false;
runtime.scheduleHoverTimer(() => {
    hoverTriggered = true;
}, 50);
assert.equal(timers.length, 2);
timers[1].callback();
assert.equal(hoverTriggered, true);

runtime.clearHoverTimer();
runtime.clearRestoreTimer();

console.log('panel hover restore runtime smoke ok');

import assert from 'node:assert/strict';
import { createStationOffsetRuntimeController } from '../src/features/layer/stationOffsetRuntimeController.js';

const createMapEngineStub = () => {
    const listeners = new Map();
    return {
        emit(eventName) {
            const set = listeners.get(eventName);
            if (!set) return;
            for (const listener of Array.from(set)) listener();
        },
        listenerCount(eventName) {
            return listeners.get(eventName)?.size || 0;
        },
        off(eventName, listener) {
            listeners.get(eventName)?.delete(listener);
        },
        on(eventName, listener) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(listener);
        }
    };
};

const createTimerStub = () => {
    let nextId = 1;
    const tasks = new Map();
    return {
        clearTimeoutFn(id) {
            tasks.delete(id);
        },
        pendingDelays() {
            return Array.from(tasks.values()).map((task) => task.delay);
        },
        runAll() {
            const pending = Array.from(tasks.entries());
            tasks.clear();
            for (const [, task] of pending) task.callback();
        },
        setTimeoutFn(callback, delay) {
            const id = nextId;
            nextId += 1;
            tasks.set(id, { callback, delay });
            return id;
        }
    };
};

const recordSync = (calls) => (nextZoom, options = {}) => {
    calls.push({
        zoom: Number(nextZoom.toFixed(3)),
        phase: options.phase || 'final',
        reason: options.reason || '',
        updateVisible: options.updateVisible
    });
    return true;
};

{
    let zoom = 10;
    const synced = [];
    const timers = createTimerStub();
    const mapEngine = createMapEngineStub();
    let now = 0;
    const controller = createStationOffsetRuntimeController({
        clearTimeoutFn: timers.clearTimeoutFn,
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        nowFn: () => now,
        setTimeoutFn: timers.setTimeoutFn,
        syncStationOffsetForZoom: recordSync(synced)
    });

    controller.syncAtCurrentZoom();
    zoom = 10.1;
    mapEngine.emit('zoom');
    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual' },
        { zoom: 10.1, phase: 'visual', reason: 'zoom' }
    ].map((x) => ({ ...x, updateVisible: undefined })));
    assert.deepEqual(timers.pendingDelays(), []);

    zoom = 10.19;
    now = 32;
    mapEngine.emit('zoom');

    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual' },
        { zoom: 10.1, phase: 'visual', reason: 'zoom' }
    ].map((x) => ({ ...x, updateVisible: undefined })));

    now = 48;
    mapEngine.emit('zoom');

    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual' },
        { zoom: 10.1, phase: 'visual', reason: 'zoom' },
        { zoom: 10.19, phase: 'visual', reason: 'zoom' }
    ].map((x) => ({ ...x, updateVisible: undefined })));
    assert.equal(controller.isDynamicMode(), true);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual' },
        { zoom: 10.1, phase: 'visual', reason: 'zoom' },
        { zoom: 10.19, phase: 'visual', reason: 'zoom' },
        { zoom: 10.19, phase: 'final', reason: 'zoomend' }
    ].map((x) => ({ ...x, updateVisible: undefined })));

    controller.destroy();
    assert.equal(mapEngine.listenerCount('zoom'), 0);
    assert.equal(mapEngine.listenerCount('zoomend'), 0);
}

{
    let zoom = 10;
    const synced = [];
    const timers = createTimerStub();
    const mapEngine = createMapEngineStub();
    let now = 0;
    const controller = createStationOffsetRuntimeController({
        clearTimeoutFn: timers.clearTimeoutFn,
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        nowFn: () => now,
        setTimeoutFn: timers.setTimeoutFn,
        syncStationOffsetForZoom: recordSync(synced)
    });

    controller.syncAtCurrentZoom();
    for (const nextZoom of [10.005, 10.01, 10.015, 10.02, 10.025, 10.03, 10.035, 10.04, 10.045]) {
        now += 8;
        zoom = nextZoom;
        mapEngine.emit('zoom');
    }

    const expectedSettlingSyncs = [
        { zoom: 10, phase: 'final', reason: 'manual' },
        { zoom: 10.005, phase: 'visual', reason: 'zoom-settling' },
        { zoom: 10.015, phase: 'visual', reason: 'zoom-settling' },
        { zoom: 10.025, phase: 'visual', reason: 'zoom-settling' },
        { zoom: 10.035, phase: 'visual', reason: 'zoom-settling' },
        { zoom: 10.045, phase: 'visual', reason: 'zoom-settling' }
    ].map((x) => ({ ...x, updateVisible: undefined }));
    assert.deepEqual(synced, expectedSettlingSyncs);
    assert.deepEqual(timers.pendingDelays(), []);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [
        ...expectedSettlingSyncs,
        { zoom: 10.045, phase: 'final', reason: 'zoomend', updateVisible: undefined }
    ]);
}

{
    let zoom = 11;
    const synced = [];
    const timers = createTimerStub();
    const mapEngine = createMapEngineStub();
    let now = 0;
    const controller = createStationOffsetRuntimeController({
        clearTimeoutFn: timers.clearTimeoutFn,
        getZoom: () => zoom,
        initialMode: 'performance',
        mapEngine,
        nowFn: () => now,
        setTimeoutFn: timers.setTimeoutFn,
        syncStationOffsetForZoom: recordSync(synced)
    });

    zoom = 11.4;
    mapEngine.emit('zoom');
    assert.deepEqual(synced, []);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [{ zoom: 11.4, phase: 'final', reason: 'zoomend', updateVisible: undefined }]);

    zoom = 12;
    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [
        { zoom: 11.4, phase: 'final', reason: 'zoomend', updateVisible: undefined },
        { zoom: 12, phase: 'final', reason: 'zoomend', updateVisible: undefined }
    ]);

    assert.equal(controller.setMode('dynamic', { sync: false }), 'dynamic');
    assert.equal(controller.isDynamicMode(), true);
}

console.log('station offset runtime controller smoke ok');

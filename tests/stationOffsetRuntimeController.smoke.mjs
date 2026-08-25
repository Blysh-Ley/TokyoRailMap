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

const createFrameStub = () => {
    let nextId = 1;
    const tasks = new Map();
    return {
        cancelFrame(id) {
            tasks.delete(id);
        },
        pendingCount() {
            return tasks.size;
        },
        requestFrame(callback) {
            const id = nextId;
            nextId += 1;
            tasks.set(id, callback);
            return id;
        },
        runAll() {
            const pending = Array.from(tasks.values());
            tasks.clear();
            for (const callback of pending) callback();
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
        { zoom: 10.19, phase: 'visual', reason: 'zoom' }
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
        { zoom: 10.045, phase: 'visual', reason: 'zoom-settling' },
        { zoom: 10.045, phase: 'final', reason: 'zoom-settling' }
    ].map((x) => ({ ...x, updateVisible: undefined }));
    assert.deepEqual(synced, expectedSettlingSyncs);
    assert.deepEqual(timers.pendingDelays(), []);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced, expectedSettlingSyncs);
}

{
    let zoom = 10;
    let now = 0;
    const synced = [];
    const zoomEndNotifications = [];
    const frames = createFrameStub();
    const mapEngine = createMapEngineStub();
    const controller = createStationOffsetRuntimeController({
        activeFinalIntervalMs: 1000,
        cancelFrame: frames.cancelFrame,
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        nowFn: () => now,
        onDynamicZoomEnd: ({ zoom: finalZoom }) => zoomEndNotifications.push(finalZoom),
        requestFrame: frames.requestFrame,
        settlingFinalIntervalMs: 15,
        syncStationOffsetForZoom: recordSync(synced),
        visualSyncStrategy: 'raf-latest'
    });

    controller.syncAtCurrentZoom();
    zoom = 10.1;
    now = 5;
    mapEngine.emit('zoom');
    zoom = 10.2;
    now = 6;
    mapEngine.emit('zoom');
    zoom = 10.3;
    now = 7;
    mapEngine.emit('zoom');

    assert.equal(frames.pendingCount(), 1);
    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual', updateVisible: undefined }
    ]);

    frames.runAll();
    assert.equal(frames.pendingCount(), 0);
    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual', updateVisible: undefined },
        { zoom: 10.3, phase: 'visual', reason: 'zoom', updateVisible: undefined }
    ]);

    zoom = 10.31;
    now = 15;
    mapEngine.emit('zoom');
    zoom = 10.32;
    now = 16;
    mapEngine.emit('zoom');
    assert.equal(frames.pendingCount(), 1);
    frames.runAll();
    assert.deepEqual(synced.slice(-2), [
        { zoom: 10.32, phase: 'visual', reason: 'zoom-settling', updateVisible: undefined },
        { zoom: 10.32, phase: 'final', reason: 'zoom-settling', updateVisible: undefined }
    ]);

    zoom = 10.5;
    now = 20;
    mapEngine.emit('zoom');
    assert.equal(frames.pendingCount(), 1);
    mapEngine.emit('zoomend');
    assert.equal(frames.pendingCount(), 0);
    assert.deepEqual(synced.slice(-2), [
        { zoom: 10.5, phase: 'visual', reason: 'zoomend', updateVisible: undefined },
        { zoom: 10.5, phase: 'final', reason: 'zoomend', updateVisible: undefined }
    ]);
    assert.deepEqual(zoomEndNotifications, [10.5]);
    const syncCountAfterZoomEnd = synced.length;
    frames.runAll();
    assert.equal(synced.length, syncCountAfterZoomEnd);

    zoom = 10.7;
    mapEngine.emit('zoom');
    assert.equal(frames.pendingCount(), 1);
    controller.setMode('performance', { sync: false });
    assert.equal(frames.pendingCount(), 0);
    frames.runAll();
    assert.equal(synced.length, syncCountAfterZoomEnd);

    controller.setMode('dynamic', { sync: false });
    zoom = 10.8;
    mapEngine.emit('zoom');
    assert.equal(frames.pendingCount(), 1);
    controller.destroy();
    assert.equal(frames.pendingCount(), 0);
    frames.runAll();
    assert.equal(synced.length, syncCountAfterZoomEnd);
}

{
    let zoom = 9;
    const synced = [];
    const frames = createFrameStub();
    const mapEngine = createMapEngineStub();
    const controller = createStationOffsetRuntimeController({
        cancelFrame: null,
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        requestFrame: frames.requestFrame,
        syncStationOffsetForZoom: recordSync(synced),
        visualSyncStrategy: 'raf-latest'
    });

    zoom = 9.2;
    mapEngine.emit('zoom');
    assert.equal(frames.pendingCount(), 0);
    assert.deepEqual(synced, [
        { zoom: 9.2, phase: 'visual', reason: 'zoom', updateVisible: undefined }
    ]);
    controller.destroy();
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

{
    let zoom = 10;
    const synced = [];
    const frames = createFrameStub();
    const mapEngine = createMapEngineStub();
    const controller = createStationOffsetRuntimeController({
        cancelFrame: frames.cancelFrame,
        finalSyncStrategy: 'zoomend-only',
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        requestFrame: frames.requestFrame,
        syncStationOffsetForZoom: (nextZoom, options = {}) => {
            synced.push({
                zoom: Number(nextZoom.toFixed(3)),
                phase: options.phase,
                reason: options.reason,
                force: options.force === true
            });
            return true;
        },
        visualSyncStrategy: 'raf-latest'
    });

    controller.syncAtCurrentZoom();
    zoom = 10.5;
    mapEngine.emit('zoom');
    frames.runAll();
    zoom = 10;
    mapEngine.emit('zoom');
    frames.runAll();

    assert.deepEqual(synced, [
        { zoom: 10, phase: 'final', reason: 'manual', force: false },
        { zoom: 10.5, phase: 'visual', reason: 'zoom', force: false },
        { zoom: 10, phase: 'visual', reason: 'zoom', force: false }
    ]);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced.at(-1), {
        zoom: 10,
        phase: 'final',
        reason: 'zoomend',
        force: true
    });
    controller.destroy();
}

console.log('station offset runtime controller smoke ok');

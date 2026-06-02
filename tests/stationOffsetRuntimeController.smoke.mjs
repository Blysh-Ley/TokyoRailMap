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

{
    let zoom = 10;
    const synced = [];
    const mapEngine = createMapEngineStub();
    const controller = createStationOffsetRuntimeController({
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        syncStationOffsetForZoom: (nextZoom) => synced.push(Number(nextZoom.toFixed(3)))
    });

    controller.syncAtCurrentZoom();
    zoom = 10.1;
    mapEngine.emit('zoom');
    zoom = 10.21;
    mapEngine.emit('zoom');

    assert.deepEqual(synced, [10, 10.21]);
    assert.equal(controller.isDynamicMode(), true);

    controller.destroy();
    assert.equal(mapEngine.listenerCount('zoom'), 0);
    assert.equal(mapEngine.listenerCount('zoomend'), 0);
}

{
    let zoom = 10;
    const synced = [];
    const mapEngine = createMapEngineStub();
    const controller = createStationOffsetRuntimeController({
        getZoom: () => zoom,
        initialMode: 'dynamic',
        mapEngine,
        syncStationOffsetForZoom: (nextZoom) => synced.push(Number(nextZoom.toFixed(3)))
    });

    controller.syncAtCurrentZoom();
    for (const nextZoom of [10.005, 10.01, 10.015, 10.02, 10.025, 10.03, 10.035, 10.04]) {
        zoom = nextZoom;
        mapEngine.emit('zoom');
    }

    assert.deepEqual(synced, [10]);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [10, 10.04]);
}

{
    let zoom = 11;
    const synced = [];
    const mapEngine = createMapEngineStub();
    const controller = createStationOffsetRuntimeController({
        getZoom: () => zoom,
        initialMode: 'performance',
        mapEngine,
        syncStationOffsetForZoom: (nextZoom) => synced.push(Number(nextZoom.toFixed(3)))
    });

    zoom = 11.4;
    mapEngine.emit('zoom');
    assert.deepEqual(synced, []);

    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [11.4]);

    zoom = 12;
    mapEngine.emit('zoomend');
    assert.deepEqual(synced, [11.4, 12]);

    assert.equal(controller.setMode('dynamic', { sync: false }), 'dynamic');
    assert.equal(controller.isDynamicMode(), true);
}

console.log('station offset runtime controller smoke ok');

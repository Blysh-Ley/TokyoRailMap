import assert from 'node:assert/strict';
import { createStationOffsetPerformanceProbe } from '../src/debug/stationOffsetPerformanceProbe.js';

const listeners = new Map();
let zoom = 11;
const mapEngine = {
    emit(eventName, payload) {
        for (const listener of listeners.get(eventName) || []) listener(payload);
    },
    getZoom: () => zoom,
    off(eventName, listener) {
        listeners.get(eventName)?.delete(listener);
    },
    on(eventName, listener) {
        if (!listeners.has(eventName)) listeners.set(eventName, new Set());
        listeners.get(eventName).add(listener);
    }
};

let now = 0;
let nextTimerId = 1;
const timers = new Map();
const target = {};
let frameCallback = null;
const probe = createStationOffsetPerformanceProbe({
    PerformanceObserverCtor: null,
    cancelFrame: null,
    clearTimeoutFn: (id) => timers.delete(id),
    consoleRef: {},
    mapEngine,
    nowFn: () => now,
    requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
    },
    setTimeoutFn: (callback, delay) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delay });
        return id;
    },
    target
});

assert.equal(target.__TokyoRailStationOffsetPerf, probe);
assert.deepEqual(probe.setContext({ stationOffsetMode: 'dynamic', baseStationFeatureCount: 42 }), {
    stationOffsetMode: 'dynamic',
    baseStationFeatureCount: 42
});
probe.recordOffsetApplied({ zoom: 11, phase: 'final', reason: 'initial', updateVisible: true });
assert.equal(probe.start(), true);
frameCallback(0);

mapEngine.emit('zoomstart');
now += 5;
zoom = 11.25;
mapEngine.emit('zoom');
frameCallback(now);

probe.measure('sync-total', () => {
    probe.measure('build-offset-geojson', () => {
        now += 4;
    });
    probe.measure('update-stations-source', () => {
        now += 2;
    });
});
probe.recordSyncAttempt({
    zoom,
    phase: 'visual',
    reason: 'zoom',
    outcome: 'completed'
});
probe.recordOffsetApplied({
    zoom,
    phase: 'visual',
    reason: 'zoom',
    updateVisible: true
});
now += 1;
mapEngine.emit('sourcedata', { sourceId: 'stations-source' });
now += 1;
mapEngine.emit('render');

zoom = 11.5;
mapEngine.emit('zoom');
now += 5;
frameCallback(now);
mapEngine.emit('zoomend');
assert.deepEqual(Array.from(timers.values()).map((item) => item.delay), [250]);

now += 250;
for (const { callback } of timers.values()) callback();
timers.clear();

const report = probe.stop({ print: false });
assert.equal(report.summary.sessionCount, 1);
assert.equal(report.context.baseStationFeatureCount, 42);
assert.equal(report.sessions[0].context.stationOffsetMode, 'dynamic');
assert.equal(report.summary.totalZoomEvents, 2);
assert.equal(report.summary.totalSyncAttempts, 1);
assert.equal(report.summary.totalSyncCompleted, 1);
assert.equal(report.summary.totalSyncSkipped, 0);
assert.equal(report.summary.totalSyncMs, 6);
assert.equal(report.summary.totalStationOffsetWorkMs, 6);
assert.equal(report.sessions[0].startZoom, 11);
assert.equal(report.sessions[0].endZoom, 11.5);
assert.equal(report.sessions[0].syncTotal.totalMs, 6);
assert.equal(report.sessions[0].stationOffsetWorkTotal.totalMs, 6);
assert.equal(report.sessions[0].offsetTracking.visibleApplicationCount, 1);
assert.equal(report.sessions[0].offsetTracking.firstApplicationDelayMs, 11);
assert.equal(report.sessions[0].offsetTracking.zoomGap.p95Zoom, 0.25);
assert.equal(report.sessions[0].offsetTracking.zoomGap.maxZoom, 0.25);
assert.equal(report.sessions[0].offsetTracking.finalZoomGap, 0.25);
assert.equal(report.sessions[0].offsetTracking.caughtUpAtOrAfterZoomEnd, false);
assert.equal(report.sessions[0].offsetTracking.thresholds.over0_1Zoom.framePercent, 100);
assert.equal(report.sessions[0].sourcePipeline.sourceAcknowledgementCount, 1);
assert.equal(report.sessions[0].sourcePipeline.renderedAfterAcknowledgementCount, 1);
assert.equal(report.sessions[0].sourcePipeline.submitToSourceEvent.averageMs, 1);
assert.equal(report.sessions[0].sourcePipeline.submitToRender.averageMs, 2);
assert.equal(report.atomicStages[0].stage, 'build-offset-geojson');
assert.equal(report.atomicStages[0].totalMs, 4);
assert.equal(report.atomicStages[1].stage, 'update-stations-source');
assert.equal(report.atomicStages[1].totalMs, 2);

probe.destroy();
assert.equal(target.__TokyoRailStationOffsetPerf, undefined);
assert.equal(listeners.get('zoomstart')?.size, 0);
assert.equal(listeners.get('zoom')?.size, 0);
assert.equal(listeners.get('zoomend')?.size, 0);
assert.equal(listeners.get('sourcedata')?.size, 0);
assert.equal(listeners.get('render')?.size, 0);

console.log('station offset performance probe smoke ok');

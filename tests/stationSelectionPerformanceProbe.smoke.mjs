import assert from 'node:assert/strict';
import { createStationSelectionPerformanceProbe, stationSelectionPerf } from '../src/debug/stationSelectionPerformanceProbe.js';

const emitter = () => {
    const listeners = new Map();
    return {
        listeners,
        on(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        off(type, listener) { listeners.get(type)?.delete(listener); },
        emit(type, event = {}) { for (const listener of listeners.get(type) || []) listener(event); },
        listenerCount() { return Array.from(listeners.values()).reduce((sum, value) => sum + value.size, 0); }
    };
};
const mapEngine = emitter();
const target = emitter();
target.addEventListener = target.on;
target.removeEventListener = target.off;
let now = 100;
let clockReads = 0;
let nextFrameId = 0;
const frames = new Map();
const observerInstances = [];
class Observer {
    static supportedEntryTypes = ['longtask', 'event'];
    constructor(callback) {
        this.callback = callback;
        this.pending = [];
        this.disconnected = false;
        observerInstances.push(this);
    }
    observe(options) { this.options = options; }
    takeRecords() { return this.pending.splice(0); }
    disconnect() { this.disconnected = true; }
    deliver(entries) { this.callback({ getEntries: () => entries }); }
}
const probe = createStationSelectionPerformanceProbe({
    now: () => { clockReads += 1; return now; },
    requestFrame: (callback) => { const id = ++nextFrameId; frames.set(id, callback); return id; },
    cancelFrame: (id) => frames.delete(id),
    PerformanceObserver: Observer
});
const tickFrame = (at) => {
    now = at;
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(at);
};

// 默认关闭时不读时钟，不安排工作，关闭状态的 span 共用同一个空函数。
assert.equal(stationSelectionPerf.currentId(), null);
assert.equal(stationSelectionPerf.report().enabled, false);
assert.equal(probe.begin('station', { stationId: 'A' }), null);
assert.equal(probe.ensure('station', { stationId: 'A' }), null);
probe.mark('disabled');
assert.equal(probe.span('one'), probe.span('two'));
probe.span('disabled')();
probe.report();
probe.stop();
assert.equal(clockReads, 0);
assert.equal(observerInstances.length, 0);
assert.equal(frames.size, 0);

probe.start({ target, mapEngine });
probe.start({ target, mapEngine });
assert.equal(observerInstances.length, 2);
assert.equal(mapEngine.listenerCount(), 4);
assert.equal(target.listenerCount(), 2);
assert.equal(frames.size, 1);
assert.equal(observerInstances[1].options.durationThreshold, 16);
const first = probe.begin('station', { stationId: 'A', ignoredData: { large: true } });
assert.equal(probe.ensure('station', { stationId: 'A' }), first);
const endOldAsync = probe.span('timetable-prepare', { kind: 'wall' });
const endSync = probe.span('selection-paint', { kind: 'sync' });
now = 105;
endSync({ calls: 2 });
endSync();
mapEngine.emit('sourcedata', { sourceId: 'osm-vector-source' });
mapEngine.emit('sourcedata', { sourceId: 'trip-preview-source', sourceDataType: 'content', isSourceLoaded: true });
mapEngine.emit('render');
mapEngine.emit('idle');
assert.equal(probe.currentId(), first, '地图 idle 不结束交互会话');
tickFrame(170);
now = 180;
const second = probe.begin('station', { stationId: 'B' });
assert.notEqual(second, first);
now = 190;
endOldAsync({ cancelled: true });
probe.mark('late-old-mark', {}, first);
observerInstances[0].deliver([{ name: 'self', startTime: 110, duration: 60 }]);
observerInstances[0].deliver([{ name: 'cross-boundary', startTime: 160, duration: 80 }]);
observerInstances[1].deliver([{ name: 'click', startTime: 102, duration: 70,
    processingStart: 103, processingEnd: 109, interactionId: 7, target: { ignored: true } }]);
const error = new Error('诊断样例');
target.emit('error', { error, preventDefault: () => assert.fail('探针不能阻止原异常') });
target.emit('unhandledrejection', { reason: new Error('拒绝样例') });
mapEngine.emit('error', { error: new Error('地图样例') });
tickFrame(200);
observerInstances[0].pending.push({ name: 'stop-flush', startTime: 200, duration: 60 });
now = 280;
const endAcrossRestart = probe.span('unfinished');
const result = probe.stop();
assert.equal(mapEngine.listenerCount(), 0);
assert.equal(target.listenerCount(), 0);
assert.equal(frames.size, 0);
assert.equal(observerInstances.every((observer) => observer.disconnected), true);
assert.equal(result.summary.sessionCount, 2);
assert.equal(result.summary.longTaskCount, 3);
assert.equal(result.capabilities.longtask.status, 'available');
assert.equal(result.capabilities.event.status, 'available');
assert.equal(result.firstException.message, '诊断样例');
assert.match(result.firstException.stack, /诊断样例/);
assert.equal(result.sessions[0].closeReason, 'next-interaction');
assert.equal(result.sessions[1].closeReason, 'stop');
assert.equal(result.sessions[0].detail.ignoredData, undefined);
assert.deepEqual(result.sessions[0].frameGaps, [{ startedAt: 100, endedAt: 170,
    durationMs: 70, fromInteractionStart: true }]);
assert.equal(result.sessions[1].frameGaps.length, 0, '新会话首帧从新 begin 起算');
assert.equal(result.sessions[0].mapEvents.filter((event) => event.type === 'sourcedata').length, 1);
assert.equal(result.sessions[0].events.find((event) => event.name === 'timetable-prepare').late, true);
assert.equal(result.sessions[0].events.find((event) => event.name === 'timetable-prepare').durationMs, 90);
assert.equal(result.sessions[1].events.some((event) => event.name === 'timetable-prepare'), false);
assert.deepEqual(result.sessions[0].stages.find((stage) => stage.name === 'selection-paint'), {
    name: 'selection-paint', kind: 'sync', count: 1, lateCount: 0, totalMs: 5, maxMs: 5, p95Ms: 5
});
assert.equal(result.sessions[0].longTasks.length, 2, '延迟派发仍归属原会话');
assert.equal(result.sessions[0].longTasks.find((entry) => entry.name === 'cross-boundary').overlapMs, 20);
assert.equal(result.sessions[1].longTasks.find((entry) => entry.name === 'cross-boundary').overlapMs, 60);
assert.equal(result.sessions[1].longTasks.some((entry) => entry.name === 'stop-flush'), true);
assert.equal(result.sessions[0].eventTiming[0].interactionId, 7);
assert.equal(result.sessions[0].eventTiming[0].target, undefined);
assert.equal(result.sessions[1].errors.length, 3);
const readsAfterStop = clockReads;
endAcrossRestart();
probe.report();
probe.mark('after-stop');
assert.equal(clockReads, readsAfterStop);
result.sessions[0].events[0].detail.calls = 999;
assert.equal(probe.report().sessions[0].events[0].detail.calls, 2, '导出的对象不能修改探针记录');

// stop/start 不让旧异步 span 把停止期间也算入测量；clear 不重用会话编号。
probe.start();
endAcrossRestart();
assert.equal(probe.report().sessions[1].events.some((event) => event.name === 'unfinished'), false);
const beforeClear = probe.begin('reset');
const staleEnd = probe.span('before-clear');
probe.clear();
const afterClear = probe.ensure('reset');
assert.ok(afterClear > beforeClear);
staleEnd();
assert.equal(probe.report().sessions[0].events.length, 0);
probe.stop();

// 容量上限只截断诊断记录，报告明确显示截断，不改变交互或阶段的执行。
const bounded = createStationSelectionPerformanceProbe({ now: () => now,
    PerformanceObserver: Observer, limits: { sessions: 1, recordsPerSession: 2, browserEntries: 1 } });
bounded.start({ target: {} });
bounded.begin('station', { stationId: 'A' });
bounded.begin('station', { stationId: 'B' });
bounded.mark('one');
bounded.mark('two');
bounded.mark('three');
observerInstances.at(-2).deliver([{ startTime: 280, duration: 80 }, { startTime: 280, duration: 90 }]);
const boundedReport = bounded.stop();
assert.equal(boundedReport.truncated, true);
assert.equal(boundedReport.droppedSessions, 1);
assert.equal(boundedReport.droppedBrowserEntries, 1);
assert.equal(boundedReport.sessions[0].droppedRecords, 1);
assert.equal(boundedReport.sessions[0].events.length, 2);

class UnsupportedObserver { static supportedEntryTypes = []; }
const unsupported = createStationSelectionPerformanceProbe({ PerformanceObserver: UnsupportedObserver });
unsupported.start({ target: {} });
const unavailable = unsupported.stop();
for (const key of ['longtask', 'event', 'raf', 'mapEvents', 'windowErrors']) {
    assert.equal(unavailable.capabilities[key].status, 'unavailable');
}
console.log('站点选择性能探针 smoke 测试通过');

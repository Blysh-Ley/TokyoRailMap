const NOOP = () => {};
const KEY_SOURCES = new Set([
    'trip-preview-source', 'trip-preview-stops-source', 'line-name-labels-source',
    'stations-source', 'station-labels-source'
]);
const DEFAULT_LIMITS = Object.freeze({ sessions: 100, recordsPerSession: 2000, browserEntries: 4000 });
const round = (value) => Math.round(value * 1000) / 1000;
const text = (value, length = 500) => String(value ?? '').slice(0, length);

// 诊断详情只保留标量，避免探针持有班次、GeoJSON、DOM 或异常对象。
const scalarDetail = (detail = {}) => Object.fromEntries(Object.entries(detail || {}).slice(0, 24)
    .filter(([, value]) => value == null || ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [text(key, 100), typeof value === 'string' ? text(value)
        : typeof value === 'number' && !Number.isFinite(value) ? null : value]));

const summarizeStages = (events) => {
    const groups = new Map();
    for (const event of events) {
        if (event.type !== 'span') continue;
        const kind = event.detail.kind === 'sync' ? 'sync' : 'wall';
        const key = `${kind}:${event.name}`;
        if (!groups.has(key)) groups.set(key, { name: event.name, kind, durations: [], lateCount: 0 });
        const group = groups.get(key);
        group.durations.push(event.durationMs);
        if (event.late) group.lateCount += 1;
    }
    return Array.from(groups.values(), ({ name, kind, durations, lateCount }) => {
        const sorted = durations.slice().sort((a, b) => a - b);
        return { name, kind, count: sorted.length, lateCount,
            totalMs: round(sorted.reduce((sum, value) => sum + value, 0)),
            maxMs: sorted.at(-1), p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
    }).sort((a, b) => b.totalMs - a.totalMs);
};

export const createStationSelectionPerformanceProbe = (options = {}) => {
    const limits = { ...DEFAULT_LIMITS, ...options.limits };
    const sessions = [];
    const sessionsById = new Map();
    const browserEntries = [];
    const unbinders = [];
    const observers = [];
    let enabled = false;
    let target = options.target || globalThis;
    let mapEngine = options.mapEngine || null;
    let sessionCounter = 0;
    let runCounter = 0;
    let activeSession = null;
    let frameId = null;
    let previousFrameAt = null;
    let firstFrame = true;
    let lastObservedAt = 0;
    let firstException = null;
    let droppedSessions = 0;
    let droppedBrowserEntries = 0;
    let capabilities = Object.fromEntries(['longtask', 'event', 'raf', 'mapEvents', 'windowErrors']
        .map((key) => [key, { status: 'not-started' }]));
    const readNow = () => Number((options.now || (() => target.performance?.now?.() ?? Date.now()))());
    const requestFrame = (callback) => (options.requestFrame || target.requestAnimationFrame?.bind(target))?.(callback);
    const cancelFrame = (id) => (options.cancelFrame || target.cancelAnimationFrame?.bind(target))?.(id);

    const record = (session, collection, item) => {
        if (!session || sessionsById.get(session.id) !== session) return;
        if (session.recordCount >= limits.recordsPerSession) {
            session.droppedRecords += 1;
            return;
        }
        session.recordCount += 1;
        session[collection].push(item);
    };
    const closeCurrent = (at, reason) => {
        if (!activeSession) return;
        activeSession.endedAt = at;
        activeSession.closeReason = reason;
        activeSession = null;
    };
    const begin = (kind, detail = {}) => {
        if (!enabled) return null;
        const at = readNow();
        lastObservedAt = at;
        closeCurrent(at, 'next-interaction');
        const session = {
            id: ++sessionCounter, kind: text(kind, 100), detail: scalarDetail(detail),
            startedAt: at, endedAt: null, closeReason: null,
            events: [], mapEvents: [], frameGaps: [], errors: [], frameCount: 0,
            recordCount: 0, droppedRecords: 0
        };
        if (sessions.length >= limits.sessions) {
            sessionsById.delete(sessions.shift().id);
            droppedSessions += 1;
        }
        sessions.push(session);
        sessionsById.set(session.id, session);
        activeSession = session;
        previousFrameAt = at;
        firstFrame = true;
        return session.id;
    };
    const currentId = () => activeSession?.id ?? null;
    const ensure = (kind, detail = {}) => enabled && activeSession
        && activeSession.kind === kind
        && String(activeSession.detail.stationId ?? '') === String(detail.stationId ?? '')
        ? activeSession.id : begin(kind, detail);
    const mark = (name, detail = {}, sessionId = currentId()) => {
        if (!enabled) return;
        const session = sessionsById.get(sessionId);
        if (!session) return;
        const at = readNow();
        lastObservedAt = at;
        record(session, 'events', { type: 'mark', name: text(name, 160), at,
            detail: scalarDetail(detail), late: session !== activeSession });
    };
    const span = (name, detail = {}, sessionId = currentId()) => {
        if (!enabled) return NOOP;
        const session = sessionsById.get(sessionId);
        if (!session) return NOOP;
        const startedAt = readNow();
        const runAtStart = runCounter;
        const initialDetail = scalarDetail(detail);
        let ended = false;
        return (extraDetail = {}) => {
            if (ended || !enabled || runAtStart !== runCounter || sessionsById.get(session.id) !== session) return;
            ended = true;
            const endedAt = readNow();
            lastObservedAt = endedAt;
            record(session, 'events', { type: 'span', name: text(name, 160), startedAt, endedAt,
                durationMs: round(Math.max(0, endedAt - startedAt)), late: session !== activeSession,
                detail: { ...initialDetail, ...scalarDetail(extraDetail) } });
        };
    };

    const acceptBrowserEntries = (type, entries = []) => {
        for (const entry of entries) {
            if (!Number.isFinite(entry.startTime) || !Number.isFinite(entry.duration)) continue;
            if (browserEntries.length >= limits.browserEntries) {
                droppedBrowserEntries += 1;
                continue;
            }
            browserEntries.push({ type, name: text(entry.name, 160), startTime: entry.startTime,
                duration: entry.duration,
                ...(type === 'event' ? scalarDetail({ processingStart: entry.processingStart,
                    processingEnd: entry.processingEnd, interactionId: entry.interactionId,
                    cancelable: entry.cancelable }) : {}) });
        }
    };
    const observe = (type, observerOptions) => {
        const Observer = Object.hasOwn(options, 'PerformanceObserver') ? options.PerformanceObserver : target.PerformanceObserver;
        if (typeof Observer !== 'function'
            || (Array.isArray(Observer.supportedEntryTypes) && !Observer.supportedEntryTypes.includes(type))) {
            capabilities[type] = { status: 'unavailable' };
            return;
        }
        let observer;
        try {
            observer = new Observer((list) => {
                if (enabled) acceptBrowserEntries(type, list.getEntries());
            });
            observer.observe({ type, buffered: false, ...observerOptions });
            observers.push({ observer, type });
            capabilities[type] = { status: 'available', ...observerOptions };
        } catch (error) {
            observer?.disconnect?.();
            capabilities[type] = { status: 'unavailable', reason: text(error?.message) };
        }
    };
    const onFrame = () => {
        if (!enabled) return;
        if (activeSession) {
            const at = readNow();
            lastObservedAt = at;
            const durationMs = Math.max(0, at - previousFrameAt);
            activeSession.frameCount += 1;
            if (durationMs > 50) record(activeSession, 'frameGaps', {
                startedAt: previousFrameAt, endedAt: at, durationMs: round(durationMs),
                fromInteractionStart: firstFrame
            });
            firstFrame = false;
            previousFrameAt = at;
        }
        frameId = requestFrame(onFrame) ?? null;
    };
    const recordException = (origin, error, fallback = '') => {
        if (!enabled) return;
        const at = readNow();
        lastObservedAt = at;
        const item = { at, origin, message: text(error?.message || fallback || error || ''),
            stack: text(error?.stack, 3000) };
        if (!firstException) firstException = item;
        record(activeSession, 'errors', item);
    };
    const bindMap = () => {
        const available = typeof mapEngine?.on === 'function' && typeof mapEngine?.off === 'function';
        capabilities.mapEvents = { status: available ? 'available' : 'unavailable' };
        if (!available) return;
        for (const type of ['render', 'sourcedata', 'error', 'idle']) {
            const listener = (event = {}) => {
                if (!enabled) return;
                if (type === 'error') recordException('map', event.error, event.message);
                if (!activeSession || (type === 'sourcedata' && !KEY_SOURCES.has(event.sourceId))) return;
                const at = readNow();
                lastObservedAt = at;
                record(activeSession, 'mapEvents', { type, at,
                    ...(type === 'sourcedata' ? scalarDetail({ sourceId: event.sourceId,
                        sourceDataType: event.sourceDataType, isSourceLoaded: event.isSourceLoaded,
                        tile: Boolean(event.tile || event.coord) }) : {}) });
            };
            mapEngine.on(type, listener);
            unbinders.push(() => mapEngine.off(type, listener));
        }
    };
    const bindErrors = () => {
        const available = typeof target.addEventListener === 'function' && typeof target.removeEventListener === 'function';
        capabilities.windowErrors = { status: available ? 'available' : 'unavailable' };
        if (!available) return;
        const listeners = {
            error: (event) => recordException('window.error', event.error, event.message),
            unhandledrejection: (event) => recordException('window.unhandledrejection', event.reason)
        };
        for (const [type, listener] of Object.entries(listeners)) {
            target.addEventListener(type, listener);
            unbinders.push(() => target.removeEventListener(type, listener));
        }
    };
    const report = () => {
        const observedUntil = enabled ? readNow() : lastObservedAt;
        const attributedEntries = new Set();
        const sessionReports = sessions.map((session) => {
            const endedAt = session.endedAt ?? observedUntil;
            // 浏览器条目可能延迟派发；以实际时间交集归属，不以观察器回调时的当前站点归属。
            const entries = browserEntries.flatMap((entry, index) => {
                const entryEnd = entry.startTime + entry.duration;
                const overlaps = entry.startTime < endedAt && entryEnd > session.startedAt;
                if (!overlaps) return [];
                attributedEntries.add(index);
                return [{ ...entry, overlapMs: round(Math.max(0,
                    Math.min(endedAt, entryEnd) - Math.max(session.startedAt, entry.startTime))),
                startedBeforeSession: entry.startTime < session.startedAt }];
            });
            const { recordCount: _recordCount, ...data } = session;
            return { ...data, detail: { ...session.detail }, durationMs: round(Math.max(0, endedAt - session.startedAt)),
                truncated: session.droppedRecords > 0,
                events: session.events.map((event) => ({ ...event, detail: { ...event.detail } })),
                mapEvents: session.mapEvents.map((event) => ({ ...event })),
                frameGaps: session.frameGaps.map((event) => ({ ...event })),
                errors: session.errors.map((event) => ({ ...event })),
                stages: summarizeStages(session.events),
                longTasks: entries.filter((entry) => entry.type === 'longtask'),
                eventTiming: entries.filter((entry) => entry.type === 'event') };
        });
        return {
            probe: 'station-selection-performance', schemaVersion: 1, enabled, observedUntil,
            capabilities: Object.fromEntries(Object.entries(capabilities).map(([key, value]) => [key, { ...value }])),
            semantics: {
                mapRender: '地图 render 只是渲染时序代理，不能确认本次高亮像素已上屏。',
                sourceData: 'source 事件没有提交身份，不与本次提交或绘制帧作一一对应。',
                frames: 'RAF 间隔反映主线程获得回调的机会，不是地图帧率；只保存超过 50ms 的间隔。',
                spans: 'span 记录墙钟耗时；kind=sync 表示同步调用范围。嵌套阶段不可相加，异步阶段不可当作 CPU 时间。',
                browserEntries: '按条目与会话时间窗的交集归属；跨会话条目可以出现在多个会话，不能重复累加。',
                eventTiming: '仅收集浏览器提供的 Event Timing，阈值为 16ms；没有条目不代表没有输入等待。',
                completion: 'idle 不结束会话；会话在下次交互或 stop 时关闭，durationMs 不是响应耗时。'
            },
            limits: { ...limits }, truncated: droppedSessions > 0 || droppedBrowserEntries > 0
                || sessions.some((session) => session.droppedRecords > 0),
            droppedSessions, droppedBrowserEntries, firstException: firstException ? { ...firstException } : null,
            summary: { sessionCount: sessions.length, longTaskCount: browserEntries.filter((entry) => entry.type === 'longtask').length,
                eventTimingCount: browserEntries.filter((entry) => entry.type === 'event').length,
                longFrameGapCount: sessions.reduce((sum, session) => sum + session.frameGaps.length, 0) },
            sessions: sessionReports,
            unattributedBrowserEntries: browserEntries.filter((_, index) => !attributedEntries.has(index)).map((entry) => ({ ...entry }))
        };
    };
    const start = (configuration = {}) => {
        if (enabled) return true;
        target = configuration.target || target;
        mapEngine = configuration.mapEngine || mapEngine;
        enabled = true;
        runCounter += 1;
        capabilities = {};
        observe('longtask');
        observe('event', { durationThreshold: 16 });
        bindMap();
        bindErrors();
        const hasFrame = typeof (options.requestFrame || target.requestAnimationFrame) === 'function';
        capabilities.raf = { status: hasFrame ? 'available' : 'unavailable' };
        if (hasFrame) frameId = requestFrame(onFrame) ?? null;
        return true;
    };
    const stop = () => {
        if (!enabled) return report();
        lastObservedAt = readNow();
        closeCurrent(lastObservedAt, 'stop');
        for (const { observer, type } of observers.splice(0)) {
            acceptBrowserEntries(type, observer.takeRecords?.() || []);
            observer.disconnect();
        }
        enabled = false;
        if (frameId != null) cancelFrame(frameId);
        frameId = null;
        previousFrameAt = null;
        while (unbinders.length) unbinders.pop()();
        return report();
    };
    const clear = () => {
        sessions.length = 0;
        sessionsById.clear();
        browserEntries.length = 0;
        activeSession = null;
        previousFrameAt = null;
        firstException = null;
        droppedSessions = 0;
        droppedBrowserEntries = 0;
        lastObservedAt = 0;
        // 不重用会话编号，防止清空前的异步 end 写入新会话。
    };
    return { start, stop, clear, report, begin, ensure, currentId, mark, span };
};

// 导入时不注册监听、不启动观察器或 RAF；应用显式开启后才产生测量开销。
export const stationSelectionPerf = createStationSelectionPerformanceProbe();

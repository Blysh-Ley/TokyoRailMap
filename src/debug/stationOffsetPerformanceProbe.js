const DEFAULT_SETTLE_DELAY_MS = 250;
const DEFAULT_FRAME_BUDGET_MS = 1000 / 60;
const DEFAULT_LONG_FRAME_MS = 50;
const DEFAULT_ZOOM_LAG_THRESHOLDS = Object.freeze([0.01, 0.05, 0.1]);
const GLOBAL_API_NAME = '__TokyoRailStationOffsetPerf';
const REPORT_ELEMENT_ID = 'station-offset-performance-report';

const round = (value, digits = 3) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const scale = 10 ** digits;
    return Math.round(n * scale) / scale;
};

const percentile = (values, ratio) => {
    const sorted = Array.isArray(values)
        ? values.filter(Number.isFinite).slice().sort((a, b) => a - b)
        : [];
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
};

const summarizeDurations = (values) => {
    const list = Array.isArray(values) ? values.filter(Number.isFinite) : [];
    const totalMs = list.reduce((sum, value) => sum + value, 0);
    return {
        count: list.length,
        totalMs: round(totalMs),
        averageMs: round(list.length ? totalMs / list.length : 0),
        maxMs: round(list.length ? Math.max(...list) : 0),
        p95Ms: round(percentile(list, 0.95))
    };
};

const summarizeZoomGaps = (values) => {
    const list = Array.isArray(values) ? values.filter(Number.isFinite) : [];
    return {
        count: list.length,
        averageZoom: round(list.length
            ? list.reduce((sum, value) => sum + value, 0) / list.length
            : 0),
        maxZoom: round(list.length ? Math.max(...list) : 0),
        p95Zoom: round(percentile(list, 0.95))
    };
};

const createEmptySession = ({ context, id, startedAt, zoom }) => ({
    id,
    context: { ...(context || {}) },
    startedAt,
    endedAt: null,
    startZoom: Number.isFinite(Number(zoom)) ? Number(zoom) : null,
    endZoom: null,
    zoomEventCount: 0,
    zoomEndedAt: null,
    zoomEndZoom: null,
    syncAttempts: [],
    offsetApplications: [],
    sourceAcknowledgements: [],
    sourcePresentations: [],
    lagSamples: [],
    stages: new Map(),
    frames: [],
    longTasks: [],
    heapStartBytes: null,
    heapEndBytes: null
});

const toSessionReport = (session, frameBudgetMs, longFrameMs, zoomLagThresholds) => {
    const endedAt = Number.isFinite(session.endedAt) ? session.endedAt : session.startedAt;
    const durationMs = Math.max(0, endedAt - session.startedAt);
    const frameDeltas = session.frames.filter(Number.isFinite);
    const longFrames = frameDeltas.filter((duration) => duration >= longFrameMs);
    const droppedFrameEstimate = frameDeltas.reduce(
        (sum, duration) => sum + Math.max(0, Math.floor(duration / frameBudgetMs) - 1),
        0
    );
    const stages = {};
    for (const [name, durations] of session.stages.entries()) {
        stages[name] = summarizeDurations(durations);
    }

    const stationOffsetWorkMs = Number(stages['station-offset-work-total']?.totalMs) || 0;
    const syncTotalMs = Number(stages['sync-total']?.totalMs) || 0;
    const longTaskTotalMs = session.longTasks.reduce((sum, task) => sum + (Number(task.duration) || 0), 0);
    const activeZoomLagSamples = Number.isFinite(Number(session.zoomEndedAt))
        ? session.lagSamples.filter((sample) => Number(sample.sampledAt) <= Number(session.zoomEndedAt))
        : session.lagSamples;
    const zoomGaps = activeZoomLagSamples.map((sample) => Number(sample.zoomGap)).filter(Number.isFinite);
    const lagSampleDurationMs = activeZoomLagSamples.reduce(
        (sum, sample) => sum + (Number(sample.frameDurationMs) || 0),
        0
    );
    const visibleApplications = session.offsetApplications.filter((item) => item.updateVisible !== false);
    const applicationIntervals = visibleApplications.slice(1).map((item, index) => (
        Number(item.atMs) - Number(visibleApplications[index].atMs)
    )).filter(Number.isFinite);
    const submitToSourceEventDurations = session.sourceAcknowledgements
        .map((item) => Number(item.submitToSourceEventMs))
        .filter(Number.isFinite);
    const submitToRenderDurations = session.sourcePresentations
        .map((item) => Number(item.submitToRenderMs))
        .filter(Number.isFinite);
    const sourceEventToRenderDurations = session.sourcePresentations
        .map((item) => Number(item.sourceEventToRenderMs))
        .filter(Number.isFinite);
    const zoomLagThresholdReport = {};
    for (const threshold of zoomLagThresholds) {
        const key = `over${String(threshold).replace('.', '_')}Zoom`;
        const matchingSamples = activeZoomLagSamples.filter((sample) => Number(sample.zoomGap) > threshold);
        const durationOverThresholdMs = matchingSamples.reduce(
            (sum, sample) => sum + (Number(sample.frameDurationMs) || 0),
            0
        );
        zoomLagThresholdReport[key] = {
            frameCount: matchingSamples.length,
            framePercent: round(activeZoomLagSamples.length
                ? (matchingSamples.length / activeZoomLagSamples.length) * 100
                : 0, 2),
            durationMs: round(durationOverThresholdMs),
            durationPercent: round(lagSampleDurationMs > 0
                ? (durationOverThresholdMs / lagSampleDurationMs) * 100
                : 0, 2)
        };
    }
    const finalAppliedZoom = Number(session.finalAppliedZoom);
    const finalZoomGap = Number.isFinite(Number(session.endZoom)) && Number.isFinite(finalAppliedZoom)
        ? Math.abs(Number(session.endZoom) - finalAppliedZoom)
        : null;
    const lastApplicationBeforeZoomEnd = Number.isFinite(Number(session.zoomEndedAt))
        ? visibleApplications.filter((item) => Number(item.absoluteAt) <= Number(session.zoomEndedAt)).at(-1)
        : null;
    const alreadyCaughtUpAtZoomEnd = Boolean(
        lastApplicationBeforeZoomEnd
        && Number.isFinite(Number(session.zoomEndZoom))
        && Math.abs(Number(lastApplicationBeforeZoomEnd.zoom) - Number(session.zoomEndZoom)) <= 0.001
    );
    const caughtUpApplication = Number.isFinite(Number(session.zoomEndZoom))
        ? visibleApplications.find((item) => (
            Number(item.absoluteAt) >= Number(session.zoomEndedAt)
            && Math.abs(Number(item.zoom) - Number(session.zoomEndZoom)) <= 0.001
        ))
        : null;
    const atomicStageRows = Object.entries(stages)
        .filter(([name]) => ![
            'station-offset-work-total',
            'sync-total',
            'apply-station-layer-total'
        ].includes(name))
        .map(([name, stats]) => ({
            stage: name,
            ...stats,
            shareOfStationOffsetWorkPercent: round(
                stationOffsetWorkMs > 0 ? (stats.totalMs / stationOffsetWorkMs) * 100 : 0,
                2
            )
        }))
        .sort((a, b) => b.totalMs - a.totalMs);

    return {
        id: session.id,
        context: { ...(session.context || {}) },
        durationMs: round(durationMs),
        startZoom: round(session.startZoom),
        endZoom: round(session.endZoom),
        zoomDelta: round(
            Number.isFinite(session.startZoom) && Number.isFinite(session.endZoom)
                ? session.endZoom - session.startZoom
                : null
        ),
        zoomEventCount: session.zoomEventCount,
        syncAttemptCount: session.syncAttempts.length,
        syncCompletedCount: session.syncAttempts.filter((item) => item.outcome === 'completed').length,
        syncSkippedCount: session.syncAttempts.filter((item) => item.outcome !== 'completed').length,
        offsetTracking: {
            visibleApplicationCount: visibleApplications.length,
            sampledActiveZoomFrameCount: activeZoomLagSamples.length,
            sampledActiveZoomDurationMs: round(lagSampleDurationMs),
            firstApplicationDelayMs: round(visibleApplications.length ? visibleApplications[0].atMs : null),
            applicationIntervals: summarizeDurations(applicationIntervals),
            zoomGap: summarizeZoomGaps(zoomGaps),
            maxStaleWhileLaggedMs: round(activeZoomLagSamples.some((sample) => Number(sample.zoomGap) > 0.01)
                ? Math.max(...activeZoomLagSamples
                    .filter((sample) => Number(sample.zoomGap) > 0.01)
                    .map((sample) => Number(sample.staleSinceApplicationMs) || 0))
                : 0),
            finalAppliedZoom: round(session.finalAppliedZoom),
            finalZoomGap: round(finalZoomGap),
            caughtUpAtOrAfterZoomEnd: alreadyCaughtUpAtZoomEnd || Boolean(caughtUpApplication),
            catchUpAfterZoomEndMs: alreadyCaughtUpAtZoomEnd
                ? 0
                : caughtUpApplication
                ? round(Number(caughtUpApplication.absoluteAt) - Number(session.zoomEndedAt))
                : null,
            thresholds: zoomLagThresholdReport
        },
        sourcePipeline: {
            submittedUpdateCount: visibleApplications.length,
            sourceAcknowledgementCount: session.sourceAcknowledgements.length,
            renderedAfterAcknowledgementCount: session.sourcePresentations.length,
            submitToSourceEvent: summarizeDurations(submitToSourceEventDurations),
            submitToRender: summarizeDurations(submitToRenderDurations),
            sourceEventToRender: summarizeDurations(sourceEventToRenderDurations)
        },
        stationOffsetMainThreadOccupancyPercent: round(
            durationMs > 0 ? (stationOffsetWorkMs / durationMs) * 100 : 0,
            2
        ),
        stationOffsetWorkTotal: stages['station-offset-work-total'] || summarizeDurations([]),
        syncTotal: stages['sync-total'] || summarizeDurations([]),
        applyStationLayerTotal: stages['apply-station-layer-total'] || summarizeDurations([]),
        atomicStages: atomicStageRows,
        frames: {
            count: frameDeltas.length,
            averageMs: round(frameDeltas.length
                ? frameDeltas.reduce((sum, value) => sum + value, 0) / frameDeltas.length
                : 0),
            p95Ms: round(percentile(frameDeltas, 0.95)),
            maxMs: round(frameDeltas.length ? Math.max(...frameDeltas) : 0),
            overBudgetCount: frameDeltas.filter((duration) => duration > frameBudgetMs).length,
            longFrameCount: longFrames.length,
            droppedFrameEstimate
        },
        longTasks: {
            count: session.longTasks.length,
            totalMs: round(longTaskTotalMs),
            maxMs: round(session.longTasks.length
                ? Math.max(...session.longTasks.map((task) => Number(task.duration) || 0))
                : 0)
        },
        heapDeltaBytes: Number.isFinite(session.heapStartBytes) && Number.isFinite(session.heapEndBytes)
            ? session.heapEndBytes - session.heapStartBytes
            : null,
        syncAttempts: session.syncAttempts.map((item) => ({ ...item })),
        offsetApplications: session.offsetApplications.map(({ absoluteAt: _absoluteAt, ...item }) => ({ ...item })),
        stages
    };
};

export const createStationOffsetPerformanceProbe = ({
    mapEngine,
    target = globalThis,
    consoleRef = globalThis.console,
    nowFn = () => globalThis.performance?.now?.() ?? Date.now(),
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
    PerformanceObserverCtor = globalThis.PerformanceObserver,
    settleDelayMs = DEFAULT_SETTLE_DELAY_MS,
    frameBudgetMs = DEFAULT_FRAME_BUDGET_MS,
    longFrameMs = DEFAULT_LONG_FRAME_MS,
    autoStart = false
} = {}) => {
    let enabled = false;
    let destroyed = false;
    let sessionCounter = 0;
    let activeSession = null;
    let settleTimerId = null;
    let frameRequestId = null;
    let lastFrameTime = null;
    let longTaskObserver = null;
    let measurementDepth = 0;
    let context = {};
    let latestAppliedZoom = null;
    let latestAppliedAt = null;
    let pendingSourceUpdate = null;
    let pendingSourcePresentation = null;
    const sessions = [];
    const unbinders = [];

    const readNow = () => Number(nowFn()) || 0;
    const readHeapBytes = () => {
        const value = Number(globalThis.performance?.memory?.usedJSHeapSize);
        return Number.isFinite(value) ? value : null;
    };

    const clearSettleTimer = () => {
        if (settleTimerId == null) return;
        clearTimeoutFn?.(settleTimerId);
        settleTimerId = null;
    };

    const ensureSession = (zoom) => {
        if (activeSession) return activeSession;
        activeSession = createEmptySession({
            context,
            id: ++sessionCounter,
            startedAt: readNow(),
            zoom
        });
        activeSession.heapStartBytes = readHeapBytes();
        return activeSession;
    };

    const finalizeSession = (zoom) => {
        if (!activeSession) return null;
        activeSession.endedAt = readNow();
        activeSession.endZoom = Number.isFinite(Number(zoom))
            ? Number(zoom)
            : activeSession.startZoom;
        activeSession.heapEndBytes = readHeapBytes();
        activeSession.finalAppliedZoom = latestAppliedZoom;
        activeSession.finalAppliedAt = latestAppliedAt;
        sessions.push(activeSession);
        const completed = activeSession;
        activeSession = null;
        pendingSourceUpdate = null;
        pendingSourcePresentation = null;
        publishReportSnapshot();
        return completed;
    };

    const scheduleSessionFinalize = (zoom) => {
        clearSettleTimer();
        const delay = Math.max(0, Number(settleDelayMs) || DEFAULT_SETTLE_DELAY_MS);
        settleTimerId = setTimeoutFn?.(() => {
            settleTimerId = null;
            finalizeSession(zoom);
        }, delay);
    };

    const onZoomStart = () => {
        if (!enabled) return;
        clearSettleTimer();
        ensureSession(mapEngine?.getZoom?.());
    };

    const onZoom = () => {
        if (!enabled) return;
        clearSettleTimer();
        const session = ensureSession(mapEngine?.getZoom?.());
        session.zoomEventCount += 1;
        session.endZoom = Number(mapEngine?.getZoom?.());
    };

    const onZoomEnd = () => {
        if (!enabled) return;
        const zoom = Number(mapEngine?.getZoom?.());
        const session = ensureSession(zoom);
        session.endZoom = zoom;
        session.zoomEndedAt = readNow();
        session.zoomEndZoom = zoom;
        scheduleSessionFinalize(zoom);
    };

    const onStationSourceData = (event) => {
        if (!enabled || !activeSession || !pendingSourceUpdate) return;
        if (String(event?.sourceId || '') !== 'stations-source') return;
        const acknowledgedAt = readNow();
        const acknowledgement = {
            zoom: pendingSourceUpdate.zoom,
            submittedAt: pendingSourceUpdate.submittedAt,
            acknowledgedAt,
            submitToSourceEventMs: Math.max(0, acknowledgedAt - pendingSourceUpdate.submittedAt)
        };
        activeSession.sourceAcknowledgements.push(acknowledgement);
        pendingSourcePresentation = acknowledgement;
        pendingSourceUpdate = null;
    };

    const onMapRender = () => {
        if (!enabled || !activeSession || !pendingSourcePresentation) return;
        const renderedAt = readNow();
        activeSession.sourcePresentations.push({
            zoom: pendingSourcePresentation.zoom,
            submitToRenderMs: Math.max(0, renderedAt - pendingSourcePresentation.submittedAt),
            sourceEventToRenderMs: Math.max(0, renderedAt - pendingSourcePresentation.acknowledgedAt)
        });
        pendingSourcePresentation = null;
    };

    const bindMapEvent = (eventName, listener) => {
        if (typeof mapEngine?.on !== 'function') return;
        mapEngine.on(eventName, listener);
        unbinders.push(() => mapEngine.off?.(eventName, listener));
    };

    const frameLoop = (timestamp) => {
        if (!enabled) return;
        const frameTime = Number(timestamp);
        if (activeSession && Number.isFinite(frameTime) && Number.isFinite(lastFrameTime)) {
            const frameDurationMs = Math.max(0, frameTime - lastFrameTime);
            activeSession.frames.push(frameDurationMs);
            const currentZoom = Number(mapEngine?.getZoom?.());
            if (Number.isFinite(currentZoom) && Number.isFinite(latestAppliedZoom)) {
                const sampledAt = readNow();
                activeSession.lagSamples.push({
                    frameDurationMs,
                    sampledAt,
                    zoomGap: Math.abs(currentZoom - latestAppliedZoom),
                    staleSinceApplicationMs: Number.isFinite(latestAppliedAt)
                        ? Math.max(0, sampledAt - Math.max(latestAppliedAt, activeSession.startedAt))
                        : Math.max(0, sampledAt - activeSession.startedAt)
                });
            }
        }
        lastFrameTime = frameTime;
        frameRequestId = requestFrame?.(frameLoop) ?? null;
    };

    const startFrameLoop = () => {
        if (frameRequestId != null || typeof requestFrame !== 'function') return;
        lastFrameTime = null;
        frameRequestId = requestFrame(frameLoop);
    };

    const stopFrameLoop = () => {
        if (frameRequestId != null) cancelFrame?.(frameRequestId);
        frameRequestId = null;
        lastFrameTime = null;
    };

    const startLongTaskObserver = () => {
        if (longTaskObserver || typeof PerformanceObserverCtor !== 'function') return;
        try {
            longTaskObserver = new PerformanceObserverCtor((list) => {
                if (!enabled || !activeSession) return;
                const entries = list?.getEntries?.() || [];
                for (const entry of entries) {
                    activeSession.longTasks.push({
                        startTime: round(entry?.startTime),
                        duration: round(entry?.duration)
                    });
                }
            });
            longTaskObserver.observe({ type: 'longtask' });
        } catch {
            longTaskObserver = null;
        }
    };

    const stopLongTaskObserver = () => {
        try {
            longTaskObserver?.disconnect?.();
        } catch {
            // Ignore unsupported observer cleanup.
        }
        longTaskObserver = null;
    };

    const measure = (stageName, callback) => {
        if (typeof callback !== 'function') return undefined;
        if (!enabled || !activeSession) return callback();

        const startedAt = readNow();
        const isTopLevelMeasurement = measurementDepth === 0;
        measurementDepth += 1;
        try {
            return callback();
        } finally {
            const duration = Math.max(0, readNow() - startedAt);
            measurementDepth = Math.max(0, measurementDepth - 1);
            const session = activeSession;
            const name = String(stageName || 'unknown-stage');
            if (!session.stages.has(name)) session.stages.set(name, []);
            session.stages.get(name).push(duration);
            if (isTopLevelMeasurement && name !== 'station-offset-work-total') {
                if (!session.stages.has('station-offset-work-total')) {
                    session.stages.set('station-offset-work-total', []);
                }
                session.stages.get('station-offset-work-total').push(duration);
            }
        }
    };

    const recordSyncAttempt = (detail = {}) => {
        if (!enabled || !activeSession) return false;
        const session = activeSession;
        session.syncAttempts.push({
            atMs: round(readNow() - session.startedAt),
            zoom: round(detail.zoom),
            phase: String(detail.phase || ''),
            reason: String(detail.reason || ''),
            outcome: String(detail.outcome || 'completed')
        });
        return true;
    };

    const recordOffsetApplied = (detail = {}) => {
        const zoom = Number(detail.zoom);
        const updateVisible = detail.updateVisible !== false;
        const absoluteAt = readNow();
        if (updateVisible && Number.isFinite(zoom)) {
            latestAppliedZoom = zoom;
            latestAppliedAt = absoluteAt;
            if (enabled && activeSession) {
                pendingSourceUpdate = { zoom, submittedAt: absoluteAt };
            }
        }
        if (!enabled || !activeSession) return false;
        activeSession.offsetApplications.push({
            absoluteAt,
            atMs: round(absoluteAt - activeSession.startedAt),
            zoom: round(zoom),
            phase: String(detail.phase || ''),
            reason: String(detail.reason || ''),
            updateVisible
        });
        return true;
    };

    const reset = () => {
        clearSettleTimer();
        activeSession = null;
        sessions.length = 0;
        sessionCounter = 0;
    };

    const buildReport = () => {
        const completed = activeSession
            ? [...sessions, { ...activeSession, endedAt: readNow(), endZoom: Number(mapEngine?.getZoom?.()) }]
            : sessions.slice();
        const sessionReports = completed.map((session) => toSessionReport(
            session,
            frameBudgetMs,
            longFrameMs,
            DEFAULT_ZOOM_LAG_THRESHOLDS
        ));
        const totalDurationMs = sessionReports.reduce((sum, session) => sum + (session.durationMs || 0), 0);
        const totalStationOffsetWorkMs = sessionReports.reduce(
            (sum, session) => sum + (session.stationOffsetWorkTotal.totalMs || 0),
            0
        );
        const totalSyncMs = sessionReports.reduce((sum, session) => sum + (session.syncTotal.totalMs || 0), 0);
        const combinedAtomicStages = new Map();
        for (const session of completed) {
            for (const [stage, durations] of session.stages.entries()) {
                if (['station-offset-work-total', 'sync-total', 'apply-station-layer-total'].includes(stage)) continue;
                if (!combinedAtomicStages.has(stage)) combinedAtomicStages.set(stage, []);
                combinedAtomicStages.get(stage).push(...durations);
            }
        }
        const atomicStages = Array.from(combinedAtomicStages.entries())
            .map(([stage, durations]) => ({
                stage,
                ...summarizeDurations(durations),
                shareOfStationOffsetWorkPercent: round(totalStationOffsetWorkMs > 0
                    ? (durations.reduce((sum, value) => sum + value, 0) / totalStationOffsetWorkMs) * 100
                    : 0, 2)
            }))
            .sort((a, b) => b.totalMs - a.totalMs);

        return {
            probe: 'station-offset-performance',
            generatedAt: new Date().toISOString(),
            enabled,
            context: { ...context },
            summary: {
                sessionCount: sessionReports.length,
                totalDurationMs: round(totalDurationMs),
                totalStationOffsetWorkMs: round(totalStationOffsetWorkMs),
                totalSyncMs: round(totalSyncMs),
                stationOffsetMainThreadOccupancyPercent: round(
                    totalDurationMs > 0 ? (totalStationOffsetWorkMs / totalDurationMs) * 100 : 0,
                    2
                ),
                totalZoomEvents: sessionReports.reduce((sum, session) => sum + session.zoomEventCount, 0),
                totalSyncAttempts: sessionReports.reduce((sum, session) => sum + session.syncAttemptCount, 0),
                totalSyncCompleted: sessionReports.reduce((sum, session) => sum + session.syncCompletedCount, 0),
                totalSyncSkipped: sessionReports.reduce((sum, session) => sum + session.syncSkippedCount, 0),
                longTaskCount: sessionReports.reduce((sum, session) => sum + session.longTasks.count, 0),
                droppedFrameEstimate: sessionReports.reduce((sum, session) => sum + session.frames.droppedFrameEstimate, 0)
            },
            atomicStages,
            sessions: sessionReports,
            thresholds: {
                frameBudgetMs: round(frameBudgetMs),
                longFrameMs: round(longFrameMs),
                settleDelayMs: round(settleDelayMs)
            }
        };
    };

    const publishReportSnapshot = () => {
        const documentRef = target?.document;
        if (!documentRef?.documentElement || typeof documentRef.createElement !== 'function') return false;
        let reportElement = documentRef.getElementById?.(REPORT_ELEMENT_ID);
        if (!reportElement) {
            reportElement = documentRef.createElement('script');
            reportElement.id = REPORT_ELEMENT_ID;
            reportElement.type = 'application/json';
            reportElement.hidden = true;
            documentRef.documentElement.appendChild(reportElement);
        }
        reportElement.textContent = JSON.stringify(buildReport());
        return true;
    };

    const printReport = () => {
        const report = buildReport();
        consoleRef?.group?.('[Station Offset Performance Probe]');
        consoleRef?.table?.([report.summary]);
        if (report.atomicStages.length) consoleRef?.table?.(report.atomicStages);
        if (report.sessions.length) {
            consoleRef?.table?.(report.sessions.map((session) => ({
                session: session.id,
                zoom: `${session.startZoom} -> ${session.endZoom}`,
                durationMs: session.durationMs,
                stationOffsetWorkMs: session.stationOffsetWorkTotal.totalMs,
                syncMs: session.syncTotal.totalMs,
                occupancyPercent: session.stationOffsetMainThreadOccupancyPercent,
                zoomEvents: session.zoomEventCount,
                syncCompleted: session.syncCompletedCount,
                syncSkipped: session.syncSkippedCount,
                zoomGapP95: session.offsetTracking.zoomGap.p95Zoom,
                zoomGapMax: session.offsetTracking.zoomGap.maxZoom,
                laggedFramePercent: session.offsetTracking.thresholds.over0_05Zoom.framePercent,
                finalZoomGap: session.offsetTracking.finalZoomGap,
                frameP95Ms: session.frames.p95Ms,
                longFrames: session.frames.longFrameCount,
                droppedFrames: session.frames.droppedFrameEstimate,
                longTasks: session.longTasks.count
            })));
        }
        consoleRef?.groupEnd?.();
        return report;
    };

    const start = ({ reset: shouldReset = true } = {}) => {
        if (destroyed) return false;
        if (shouldReset) reset();
        enabled = true;
        startFrameLoop();
        startLongTaskObserver();
        publishReportSnapshot();
        consoleRef?.info?.('[Station Offset Performance Probe] started');
        return true;
    };

    const setContext = (nextContext = {}) => {
        if (!nextContext || typeof nextContext !== 'object') return { ...context };
        context = { ...context, ...nextContext };
        publishReportSnapshot();
        return { ...context };
    };

    const stop = ({ print = true } = {}) => {
        if (!enabled) return buildReport();
        enabled = false;
        clearSettleTimer();
        finalizeSession(mapEngine?.getZoom?.());
        stopFrameLoop();
        stopLongTaskObserver();
        publishReportSnapshot();
        return print ? printReport() : buildReport();
    };

    const destroy = () => {
        stop({ print: false });
        destroyed = true;
        while (unbinders.length) {
            try {
                unbinders.pop()?.();
            } catch {
                // Ignore stale map listener cleanup.
            }
        }
        if (target?.[GLOBAL_API_NAME] === api) delete target[GLOBAL_API_NAME];
        target?.document?.getElementById?.(REPORT_ELEMENT_ID)?.remove?.();
    };

    const api = {
        destroy,
        isEnabled: () => enabled,
        measure,
        recordOffsetApplied,
        recordSyncAttempt,
        report: printReport,
        reset,
        setContext,
        snapshot: buildReport,
        start,
        stop
    };

    bindMapEvent('zoomstart', onZoomStart);
    bindMapEvent('zoom', onZoom);
    bindMapEvent('zoomend', onZoomEnd);
    bindMapEvent('sourcedata', onStationSourceData);
    bindMapEvent('render', onMapRender);
    if (target) target[GLOBAL_API_NAME] = api;
    if (autoStart) start();

    return api;
};

export const registerStationOffsetPerformanceProbe = (options = {}) => {
    const target = options.target || globalThis;
    const existing = target?.[GLOBAL_API_NAME];
    if (existing?.destroy) existing.destroy();
    return createStationOffsetPerformanceProbe(options);
};

const GLOBAL_KEY = '__TokyoRailTripPreviewProbe';
const GLOBAL_ENABLED_KEY = '__TokyoRailTripPreviewProbeEnabled';
const STORAGE_KEY = 'TokyoRailTripPreviewProbe';
const DEFAULT_MAX_RECORDS = 200;
const MAX_LIST_ITEMS = 12;

let sequence = 0;

const hasWindow = () => typeof window !== 'undefined';

const getNow = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
};

const roundMs = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toText = (value) => String(value ?? '').trim();

const getStorageEnabled = () => {
    if (!hasWindow()) return false;
    try {
        return window.localStorage?.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

const getUrlEnabled = () => {
    if (!hasWindow()) return false;
    try {
        const text = `${window.location?.search || ''}&${String(window.location?.hash || '').replace(/^#/, '')}`;
        return /(?:^|[?&#])tripPreviewProbe=(?:1|true|on)(?:$|[&#])/i.test(text);
    } catch {
        return false;
    }
};

const writeStorageEnabled = (enabled) => {
    if (!hasWindow()) return;
    try {
        if (enabled) window.localStorage?.setItem(STORAGE_KEY, '1');
        else window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
        // Local storage may be unavailable in some embedded runtimes.
    }
};

export const installRoutePreviewProbeGlobal = () => {
    if (!hasWindow()) return null;
    const existing = window[GLOBAL_KEY];
    if (existing && existing.__routePreviewProbeGlobal === true) return existing;

    const state = {
        __routePreviewProbeGlobal: true,
        enabled: window[GLOBAL_ENABLED_KEY] === true || getStorageEnabled() || getUrlEnabled(),
        records: Array.isArray(existing?.records) ? existing.records : [],
        maxRecords: Number.isFinite(existing?.maxRecords) ? existing.maxRecords : DEFAULT_MAX_RECORDS,
        setEnabled(value = true) {
            this.enabled = value !== false;
            window[GLOBAL_ENABLED_KEY] = this.enabled;
            writeStorageEnabled(this.enabled);
            return this.enabled;
        },
        clear() {
            this.records.length = 0;
            return this.records;
        },
        dump() {
            return this.records.slice();
        },
        last() {
            return this.records[this.records.length - 1] || null;
        }
    };

    window[GLOBAL_KEY] = state;
    if (state.enabled && typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info('[trip-preview-probe] enabled');
    }
    return state;
};

export const isRoutePreviewProbeEnabled = () => {
    const state = installRoutePreviewProbeGlobal();
    if (!state || !hasWindow()) return false;
    if (window[GLOBAL_ENABLED_KEY] === true || getStorageEnabled() || getUrlEnabled()) {
        state.enabled = true;
    }
    return state.enabled === true;
};

const listSummary = (items) => {
    const list = Array.isArray(items) ? items : [];
    return {
        count: list.length,
        sample: list.slice(0, MAX_LIST_ITEMS).map(toText).filter(Boolean)
    };
};

const setSummary = (value) => {
    if (!(value instanceof Set)) return null;
    return {
        type: 'Set',
        count: value.size,
        sample: Array.from(value).slice(0, MAX_LIST_ITEMS).map(toText).filter(Boolean)
    };
};

const featureCollectionSummary = (value) => {
    if (!value || value.type !== 'FeatureCollection') return null;
    const features = Array.isArray(value.features) ? value.features : [];
    return {
        type: 'FeatureCollection',
        featureCount: features.length
    };
};

const sanitizeValue = (value, depth = 0) => {
    if (value == null) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'function') return '[Function]';

    const set = setSummary(value);
    if (set) return set;

    const fc = featureCollectionSummary(value);
    if (fc) return fc;

    if (Array.isArray(value)) {
        if (depth >= 2) return { type: 'Array', count: value.length };
        return value.slice(0, MAX_LIST_ITEMS).map((item) => sanitizeValue(item, depth + 1));
    }

    if (typeof value === 'object') {
        if (depth >= 2) return { type: 'Object', keys: Object.keys(value).slice(0, MAX_LIST_ITEMS) };
        const out = {};
        for (const key of Object.keys(value).slice(0, MAX_LIST_ITEMS)) {
            if (key === '__routePreviewProbe') continue;
            out[key] = sanitizeValue(value[key], depth + 1);
        }
        return out;
    }

    return String(value);
};

const summarizeSegment = (segment = {}) => ({
    kind: toText(segment.kind) || null,
    lineId: toText(segment.lineId || segment.r || segment.routeLineId || segment.railwayId) || null,
    geometryLineId: toText(segment.geometryLineId || segment.geometry_line_id) || null,
    stationCount: Array.isArray(segment.stationIds) ? segment.stationIds.length : 0
});

const summarizeVirtualTrip = (payload = {}) => ({
    previewSource: toText(payload.previewSource || payload.__previewSource) || null,
    selectedLineId: toText(payload.selectedLineId) || null,
    mainLineId: toText(payload.mainLineId) || null,
    tripKey: toText(payload.tripKey) || null,
    segmentCount: Array.isArray(payload.segments) ? payload.segments.length : 0,
    segments: Array.isArray(payload.segments)
        ? payload.segments.slice(0, 4).map(summarizeSegment)
        : []
});

export const summarizeTripPreviewPayload = (payload = {}) => {
    const segments = Array.isArray(payload?.segments) ? payload.segments : [];
    const virtualTrips = Array.isArray(payload?.virtualTrips) ? payload.virtualTrips : [];
    const virtualLineIds = new Set();

    for (const trip of virtualTrips) {
        for (const segment of Array.isArray(trip?.segments) ? trip.segments : []) {
            const lineId = toText(segment?.lineId || segment?.r || segment?.routeLineId || segment?.railwayId);
            if (lineId) virtualLineIds.add(lineId);
        }
    }

    return {
        previewSource: toText(payload?.previewSource || payload?.__previewSource || payload?.source) || null,
        interaction: toText(payload?.previewInteraction || payload?.__previewInteraction) || null,
        fitMode: toText(payload?.fitMode) || null,
        previewKey: toText(payload?.previewKey || payload?.__previewKey) || null,
        tripKey: toText(payload?.tripKey) || null,
        selectedLineId: toText(payload?.selectedLineId) || null,
        mainLineId: toText(payload?.mainLineId) || null,
        segmentCount: segments.length,
        segments: segments.slice(0, 4).map(summarizeSegment),
        virtualTripCount: virtualTrips.length,
        virtualTrips: virtualTrips.slice(0, 6).map(summarizeVirtualTrip),
        virtualLineIds: Array.from(virtualLineIds).slice(0, MAX_LIST_ITEMS),
        highlightStationIds: listSummary(payload?.highlightStationIds),
        originStationIds: listSummary(payload?.originStationIds),
        terminalStationIds: listSummary(payload?.terminalStationIds)
    };
};

export const summarizeTripPreviewBuilt = (built = {}) => ({
    lineFeatureCount: Array.isArray(built?.lineFc?.features) ? built.lineFc.features.length : 0,
    stopFeatureCount: Array.isArray(built?.stopFc?.features) ? built.stopFc.features.length : 0,
    lineIdCount: built?.lineIds instanceof Set ? built.lineIds.size : 0,
    stopIdCount: built?.stopIds instanceof Set ? built.stopIds.size : 0,
    pastStopIdCount: built?.pastStopIds instanceof Set ? built.pastStopIds.size : 0,
    endpointStationIdCount: built?.endpointStationIds instanceof Set ? built.endpointStationIds.size : 0,
    startStationId: toText(built?.startStationId) || null,
    endStationId: toText(built?.endStationId) || null,
    hasBBox: !!built?.bbox
});

const captureStack = () => {
    try {
        const stack = new Error().stack || '';
        return stack
            .split('\n')
            .slice(2, 14)
            .map((line) => line.trim())
            .filter(Boolean);
    } catch {
        return [];
    }
};

const pushRecord = (record) => {
    const state = installRoutePreviewProbeGlobal();
    if (!state) return;
    state.records.push(record);
    const maxRecords = Math.max(1, Math.trunc(Number(state.maxRecords) || DEFAULT_MAX_RECORDS));
    if (state.records.length > maxRecords) {
        state.records.splice(0, state.records.length - maxRecords);
    }
};

const logRecord = (record) => {
    if (typeof console === 'undefined') return;
    if (typeof console.log === 'function') {
        console.log(`[trip-preview-probe-json] ${JSON.stringify(record)}`);
    }
    if (typeof console.groupCollapsed !== 'function') return;
    const source = record.payload?.previewSource || 'unknown-source';
    const fitMode = record.payload?.fitMode || 'unknown-fit';
    const virtualTripCount = record.payload?.virtualTripCount || 0;
    console.groupCollapsed(
        `[trip-preview-probe #${record.id}] ${source} ${fitMode} vt=${virtualTripCount} ${record.outcome} ${record.durationMs}ms`
    );
    console.log('payload', record.payload);
    console.log('options', record.options);
    console.table(record.marks.map((mark) => ({
        ms: mark.ms,
        phase: mark.phase,
        detail: mark.detail
    })));
    console.log('stack', record.stack);
    console.groupEnd();
};

const DISABLED_PROBE = Object.freeze({
    __routePreviewProbe: true,
    enabled: false,
    mark: () => {},
    finish: () => {}
});

export const isRoutePreviewProbe = (probe) => (
    probe?.__routePreviewProbe === true && typeof probe.mark === 'function'
);

export const markRoutePreviewProbe = (probe, phase, detail = {}) => {
    if (isRoutePreviewProbe(probe)) probe.mark(phase, detail);
};

export const beginRoutePreviewProbe = ({
    payload,
    options,
    tracePayload,
    owner = 'controller'
} = {}) => {
    if (!isRoutePreviewProbeEnabled()) return DISABLED_PROBE;

    const startedAtMs = getNow();
    const record = {
        id: `${Date.now().toString(36)}-${++sequence}`,
        owner,
        startedAt: new Date().toISOString(),
        payload: summarizeTripPreviewPayload(payload),
        options: sanitizeValue(options || {}),
        tracePayload: sanitizeValue(tracePayload || {}),
        stack: captureStack(),
        marks: [],
        outcome: 'pending',
        durationMs: 0
    };
    let finished = false;

    const probe = {
        __routePreviewProbe: true,
        enabled: true,
        id: record.id,
        mark(phase, detail = {}) {
            if (finished) return;
            record.marks.push({
                ms: roundMs(getNow() - startedAtMs),
                phase: toText(phase) || 'mark',
                detail: sanitizeValue(detail || {})
            });
        },
        finish(outcome = 'complete', detail = {}) {
            if (finished) return;
            this.mark(`finish:${toText(outcome) || 'complete'}`, detail);
            finished = true;
            record.outcome = toText(outcome) || 'complete';
            record.durationMs = roundMs(getNow() - startedAtMs);
            pushRecord(record);
            logRecord(record);
        }
    };

    probe.mark(`${owner}:begin`, { tracePayload });
    return probe;
};

installRoutePreviewProbeGlobal();

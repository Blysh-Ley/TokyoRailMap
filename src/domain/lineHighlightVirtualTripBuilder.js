import { buildVirtualTripPreviewPayload } from '../lib/trip-preview.js';
import { getPairMapValue } from './alternateLineMembership.js';

const toText = (value) => String(value ?? '').trim();

const normalizeLineIds = (lineIds) => {
    const raw = lineIds instanceof Set
        ? Array.from(lineIds)
        : (Array.isArray(lineIds) ? lineIds : []);
    const seen = new Set();
    const out = [];
    for (const value of raw) {
        const id = toText(value);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
};

const getLineMeta = (railwaysIndexById, lineId) => {
    if (!lineId || !railwaysIndexById) return null;
    if (typeof railwaysIndexById.get === 'function') return railwaysIndexById.get(lineId) || null;
    if (Object.prototype.hasOwnProperty.call(railwaysIndexById, lineId)) {
        return railwaysIndexById[lineId] || null;
    }
    return null;
};

const getStationIdsFromMeta = (meta) => {
    const source = Array.isArray(meta?.stations)
        ? meta.stations
        : (Array.isArray(meta?.stationIds) ? meta.stationIds : []);
    return source.map(toText).filter(Boolean);
};

const isClosedStationSequence = (stationIds) => {
    if (!Array.isArray(stationIds) || stationIds.length < 3) return false;
    return toText(stationIds[0]) === toText(stationIds[stationIds.length - 1]);
};

const getSetMapValues = (map, key) => {
    if (!map || typeof map.get !== 'function') return new Set();
    const value = map.get(toText(key));
    return value instanceof Set ? value : new Set(Array.isArray(value) ? value.map(toText).filter(Boolean) : []);
};

const isHiddenHighlightPair = (hiddenStationIds, a, b) => (
    hiddenStationIds.has(toText(a)) && hiddenStationIds.has(toText(b))
);

const pushStationSegment = (segments, lineId, stationIds, extra = {}) => {
    const ids = Array.isArray(stationIds) ? stationIds.map(toText).filter(Boolean) : [];
    if (ids.length < 2) return;
    segments.push({
        lineId,
        r: lineId,
        geometryLineId: lineId,
        offsetLineId: lineId,
        stationIds: ids,
        ...extra
    });
};

export const buildLineHighlightStationSegments = ({
    lineId,
    stationIds,
    isLoopLine = false,
    alternateLineMembership = null
} = {}) => {
    const id = toText(lineId);
    const ids = Array.isArray(stationIds) ? stationIds.map(toText).filter(Boolean) : [];
    if (!id || ids.length < 2) return [];

    const hiddenStationIds = getSetMapValues(alternateLineMembership?.highlightHiddenIdsByLineId, id);
    if (!hiddenStationIds.size) {
        const d = isLoopLine ? { d: 'loop' } : {};
        const out = [];
        pushStationSegment(out, id, ids, d);
        return out;
    }

    const out = [];
    let current = [];
    const flush = () => {
        pushStationSegment(out, id, current);
        current = [];
    };

    for (let i = 0; i < ids.length - 1; i += 1) {
        const a = ids[i];
        const b = ids[i + 1];
        if (isHiddenHighlightPair(hiddenStationIds, a, b)) {
            flush();
            continue;
        }
        if (!current.length) {
            current.push(a);
        } else if (current[current.length - 1] !== a) {
            current.push(a);
        }
        current.push(b);
    }
    flush();

    return out;
};

export const buildAlternateLineHighlightSegments = ({
    lineId,
    stationIds,
    alternateLineMembership = null
} = {}) => {
    const id = toText(lineId);
    const ids = Array.isArray(stationIds) ? stationIds.map(toText).filter(Boolean) : [];
    if (!id || ids.length < 2) return [];

    const hiddenStationIds = getSetMapValues(alternateLineMembership?.highlightHiddenIdsByLineId, id);
    if (!hiddenStationIds.size) return [];

    const out = [];
    let currentLineId = '';
    let current = [];
    const flush = () => {
        if (currentLineId) {
            pushStationSegment(out, currentLineId, current, {
                kind: 'alternate',
                geometryLineId: currentLineId,
                offsetLineId: currentLineId
            });
        }
        currentLineId = '';
        current = [];
    };

    for (let i = 0; i < ids.length - 1; i += 1) {
        const a = ids[i];
        const b = ids[i + 1];
        if (!isHiddenHighlightPair(hiddenStationIds, a, b)) {
            flush();
            continue;
        }

        const aLineId = getPairMapValue(alternateLineMembership?.highlightAlternateLineIdByLineStationId, id, a);
        const bLineId = getPairMapValue(alternateLineMembership?.highlightAlternateLineIdByLineStationId, id, b);
        const alternateLineId = aLineId && aLineId === bLineId ? aLineId : (aLineId || bLineId);
        if (!alternateLineId) {
            flush();
            continue;
        }

        if (currentLineId !== alternateLineId) {
            flush();
            currentLineId = alternateLineId;
            current = [a];
        } else if (!current.length) {
            current = [a];
        } else if (current[current.length - 1] !== a) {
            current.push(a);
        }
        current.push(b);
    }
    flush();

    return out;
};

const getLineTitle = (meta, lineId, getLineName) => {
    const fromTitle = toText(meta?.title?.['zh-Hans'])
        || toText(meta?.title?.['zh-Hant'])
        || toText(meta?.title?.ja)
        || toText(meta?.title?.en);
    return fromTitle || toText(getLineName?.(lineId)) || lineId;
};

export const buildLineHighlightVirtualTripPayloads = ({
    lineIds,
    railwaysIndexById,
    alternateLineMembership = null,
    getLineName = (lineId) => lineId,
    previewSource = 'virtual',
    fitMode = 'none',
    buildPayload = buildVirtualTripPreviewPayload
} = {}) => {
    const ids = normalizeLineIds(lineIds);
    if (!ids.length) return [];

    const out = [];
    for (const lineId of ids) {
        const meta = getLineMeta(railwaysIndexById, lineId);
        const stationIds = getStationIdsFromMeta(meta);
        if (stationIds.length < 2) continue;

        const isLoopLine = isClosedStationSequence(stationIds);
        const segments = buildLineHighlightStationSegments({
            lineId,
            stationIds,
            isLoopLine,
            alternateLineMembership
        });
        if (!segments.length) continue;

        const payload = buildPayload({
            lineId,
            lineName: getLineTitle(meta, lineId, getLineName),
            segments,
            tripKey: lineId,
            previewSource,
            fitMode
        });
        if (payload) out.push(payload);
    }

    return out;
};

export const resolveSelectionLineHighlightIds = ({
    selectedLineId,
    selectedStationLineIds
} = {}) => {
    const lineId = toText(selectedLineId);
    const mergedIds = normalizeLineIds(selectedStationLineIds);
    if (!lineId) return mergedIds;
    if (mergedIds.length > 1) return mergedIds;

    return [lineId];
};

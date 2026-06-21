import { buildVirtualTripPreviewPayload } from '../lib/trip-preview.js';

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
        const payload = buildPayload({
            lineId,
            lineName: getLineTitle(meta, lineId, getLineName),
            ...(isLoopLine
                ? { segments: [{ lineId, stationIds, d: 'loop' }] }
                : { stationIds }),
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

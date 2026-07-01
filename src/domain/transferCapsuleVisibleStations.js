const toText = (value) => String(value ?? '').trim();

export const DEFAULT_TRANSFER_CAPSULE_BASE_HIDDEN_LINE_IDS = Object.freeze([
    'Seibu.S-Yurakucho',
    'Seibu.S-Fukutoshin'
]);

export const normalizeTransferCapsuleStationIdSet = (value) => {
    if (value instanceof Set) {
        return new Set(Array.from(value).map(toText).filter(Boolean));
    }
    if (Array.isArray(value)) {
        return new Set(value.map(toText).filter(Boolean));
    }
    return new Set();
};

export const mergeTransferCapsuleStationIdSets = (...sets) => {
    const out = new Set();
    for (const set of sets) {
        for (const id of normalizeTransferCapsuleStationIdSet(set)) {
            out.add(id);
        }
    }
    return out;
};

export const shouldApplyTransferCapsuleBaseHiddenFilter = ({
    tripPreviewActive = false,
    dirPreviewActive = false
} = {}) => !(tripPreviewActive === true || dirPreviewActive === true);

export const isTransferCapsuleBaseHiddenStationId = (
    stationId,
    hiddenLineIds = DEFAULT_TRANSFER_CAPSULE_BASE_HIDDEN_LINE_IDS
) => {
    const sid = toText(stationId);
    if (!sid) return false;
    const lineIds = Array.isArray(hiddenLineIds) || hiddenLineIds instanceof Set
        ? Array.from(hiddenLineIds).map(toText).filter(Boolean)
        : DEFAULT_TRANSFER_CAPSULE_BASE_HIDDEN_LINE_IDS;
    return lineIds.some((lineId) => sid === lineId || sid.startsWith(`${lineId}.`));
};

export const filterTransferCapsuleStationIdsForBaseLayer = (
    stationIds,
    { active = true, hiddenLineIds = DEFAULT_TRANSFER_CAPSULE_BASE_HIDDEN_LINE_IDS } = {}
) => {
    if (!(stationIds instanceof Set)) return stationIds;
    if (active !== true) return stationIds;

    const out = new Set();
    for (const rawId of stationIds) {
        const id = toText(rawId);
        if (!id) continue;
        if (isTransferCapsuleBaseHiddenStationId(id, hiddenLineIds)) continue;
        out.add(id);
    }
    return out;
};

export const getFixedTransferCapsuleVisibleStationIds = (
    stationsGeoJSON,
    { active = true, hiddenLineIds = DEFAULT_TRANSFER_CAPSULE_BASE_HIDDEN_LINE_IDS } = {}
) => {
    if (active !== true) return null;
    if (!stationsGeoJSON || !Array.isArray(stationsGeoJSON.features)) return null;

    const out = new Set();
    for (const feature of stationsGeoJSON.features) {
        const sid = toText(feature?.properties?.id ?? feature?.id);
        if (!sid) continue;
        if (isTransferCapsuleBaseHiddenStationId(sid, hiddenLineIds)) continue;
        out.add(sid);
    }
    return out;
};

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value.map(toText).filter(Boolean);
    const text = toText(value);
    if (!text) return [];
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map(toText).filter(Boolean);
        } catch {
            // fall through
        }
    }
    return [text];
};

export const getTransferCapsuleStationLineIds = (props = {}) => {
    const platform = normalizeArrayLike(props?.platform_line_id);
    if (platform.length) return platform;
    return normalizeArrayLike(props?.serving_ids);
};

export const doesTransferCapsuleStationServeAnyLine = (props, lineIds) => {
    const ids = normalizeTransferCapsuleStationIdSet(lineIds);
    if (!ids.size) return false;
    return getTransferCapsuleStationLineIds(props).some((lineId) => ids.has(lineId));
};

export const resolveTransferCapsuleHighlightLineIds = ({
    selectedLineId = '',
    selectedStationLineIds,
    selectedCompany = '',
    enabledLineIdsByCompany
} = {}) => {
    const lineId = toText(selectedLineId);
    const stationLineIds = normalizeTransferCapsuleStationIdSet(selectedStationLineIds);
    if (lineId) {
        return stationLineIds.size > 1 ? stationLineIds : new Set([lineId]);
    }

    if (stationLineIds.size) return stationLineIds;

    const company = toText(selectedCompany);
    if (company && enabledLineIdsByCompany instanceof Map && enabledLineIdsByCompany.has(company)) {
        return normalizeTransferCapsuleStationIdSet(enabledLineIdsByCompany.get(company));
    }

    return null;
};

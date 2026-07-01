const toText = (value) => String(value ?? '').trim();

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

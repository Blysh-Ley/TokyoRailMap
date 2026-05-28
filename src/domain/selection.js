const toText = (value) => String(value ?? '').trim();

export const normalizeLineIdList = (value) => {
    const source = value instanceof Set
        ? Array.from(value)
        : (Array.isArray(value) ? value : (value ? [value] : []));
    const out = [];
    const seen = new Set();
    for (const item of source) {
        const id = toText(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
};

export const lineIdsToSet = (value) => {
    const ids = normalizeLineIdList(value);
    return ids.length ? new Set(ids) : null;
};

export const setToLineIdList = (value) => (
    value instanceof Set ? normalizeLineIdList(Array.from(value)) : normalizeLineIdList(value)
);

export const normalizeSelectionState = (state = {}) => {
    const selectedStationLineIds = normalizeLineIdList(state.selectedStationLineIds);
    return {
        selectedCompany: toText(state.selectedCompany) || null,
        selectedLineId: toText(state.selectedLineId) || null,
        selectedStationLineIds: selectedStationLineIds.length ? selectedStationLineIds : null,
        selectedStationId: toText(state.selectedStationId) || null,
        selectedServiceMode: toText(state.selectedServiceMode) || 'all',
        hoverPreviewEnabled: state.hoverPreviewEnabled !== false
    };
};

export const getSelectionKind = (state = {}) => {
    const normalized = normalizeSelectionState(state);
    if (normalized.selectedLineId) return 'line';
    if (normalized.selectedCompany) return 'company';
    if (normalized.selectedStationId || normalized.selectedStationLineIds?.length) return 'station';
    return 'none';
};

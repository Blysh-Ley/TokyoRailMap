const toText = (value) => String(value ?? '').trim();

export const normalizeIdSet = (value) => {
    const source = value instanceof Set
        ? Array.from(value)
        : (Array.isArray(value) ? value : (value ? [value] : []));
    const out = new Set();
    for (const item of source) {
        const id = toText(item);
        if (id) out.add(id);
    }
    return out;
};

export const isMapClickSelectionAllowedByHighlight = ({
    highlightActive = false,
    candidateIds = [],
    highlightedIds = null
} = {}) => {
    if (highlightActive !== true) return true;

    const candidates = normalizeIdSet(candidateIds);
    if (!candidates.size) return false;

    const highlighted = normalizeIdSet(highlightedIds);
    if (!highlighted.size) return false;

    for (const id of candidates) {
        if (highlighted.has(id)) return true;
    }
    return false;
};

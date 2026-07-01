import { buildBaseMultiSelectLineKey } from './multiSelectLayerProtocol.js';

const toText = (value) => String(value ?? '').trim();

const toLineIdArray = (value) => {
    if (value instanceof Set) return Array.from(value).map(toText).filter(Boolean);
    if (Array.isArray(value)) return value.map(toText).filter(Boolean);
    return [];
};

const toSelectionMap = (value) => (
    value instanceof Map ? new Map(value) : new Map()
);

export const buildBaseMultiSelectionEntry = ({
    lineIds,
    kind = 'line',
    displayName = ''
} = {}) => {
    const ids = toLineIdArray(lineIds);
    if (!ids.length) return null;
    return {
        kind: toText(kind) || 'line',
        lineIds: new Set(ids),
        displayName: toText(displayName),
        hidden: false
    };
};

export const toggleBaseMultiSelectionState = ({
    selectionsByKey,
    key,
    lineIds,
    kind = 'line',
    displayName = ''
} = {}) => {
    const k = toText(key);
    const nextSelectionsByKey = toSelectionMap(selectionsByKey);
    const entry = buildBaseMultiSelectionEntry({ lineIds, kind, displayName });
    if (!k || !entry) {
        return { changed: false, selected: false, selectionsByKey: nextSelectionsByKey };
    }
    if (nextSelectionsByKey.has(k)) {
        nextSelectionsByKey.delete(k);
        return { changed: true, selected: false, selectionsByKey: nextSelectionsByKey };
    }
    nextSelectionsByKey.set(k, entry);
    return { changed: true, selected: true, selectionsByKey: nextSelectionsByKey };
};

export const toggleBaseMultiSelectionVisibilityState = ({
    selectionsByKey,
    key
} = {}) => {
    const k = toText(key);
    const nextSelectionsByKey = toSelectionMap(selectionsByKey);
    if (!k || !nextSelectionsByKey.has(k)) {
        return { changed: false, selectionsByKey: nextSelectionsByKey };
    }
    const current = nextSelectionsByKey.get(k) || {};
    nextSelectionsByKey.set(k, {
        ...current,
        hidden: !(current?.hidden === true),
        branchAutoHidden: false
    });
    return { changed: true, selectionsByKey: nextSelectionsByKey };
};

export const removeBaseMultiSelectionState = ({
    selectionsByKey,
    key
} = {}) => {
    const k = toText(key);
    const nextSelectionsByKey = toSelectionMap(selectionsByKey);
    if (!k || !nextSelectionsByKey.has(k)) {
        return { removed: false, selectionsByKey: nextSelectionsByKey };
    }
    nextSelectionsByKey.delete(k);
    return { removed: true, selectionsByKey: nextSelectionsByKey };
};

export const clearBaseMultiSelectionsState = () => ({
    selectionsByKey: new Map()
});

export const getVisibleBaseMultiSelectionLineIds = (selectionsByKey) => {
    const out = new Set();
    if (!(selectionsByKey instanceof Map)) return out;

    for (const [key, entry] of selectionsByKey.entries()) {
        if (!toText(key)) continue;
        if (entry?.hidden === true) continue;
        for (const lineId of toLineIdArray(entry?.lineIds)) {
            out.add(lineId);
        }
    }

    return out;
};

export const buildSplitCompanyLineSelectionEntries = ({
    entry,
    existingSelectionsByKey,
    getLineName = () => '',
    resolveLineSelection = () => null
} = {}) => {
    if (!entry || toText(entry.kind) !== 'company') return null;

    const mainLineIdsByKey = new Map();
    for (const lineId of toLineIdArray(entry.lineIds)) {
        const resolved = resolveLineSelection(lineId) || {};
        const mainLineId = toText(resolved?.mainLineId || lineId) || lineId;
        const mergedLineIds = Array.isArray(resolved?.mergedLineIds)
            ? resolved.mergedLineIds.map(toText).filter(Boolean)
            : [mainLineId];
        if (!mainLineIdsByKey.has(mainLineId)) mainLineIdsByKey.set(mainLineId, new Set());
        const target = mainLineIdsByKey.get(mainLineId);
        for (const mergedLineId of mergedLineIds) {
            if (mergedLineId) target.add(mergedLineId);
        }
    }

    const out = new Map();
    for (const [mainLineId, mergedLineIds] of mainLineIdsByKey.entries()) {
        const lineIds = Array.from(mergedLineIds).map(toText).filter(Boolean);
        if (!lineIds.length) continue;
        const key = buildBaseMultiSelectLineKey(mainLineId);
        if (!key) continue;
        if (existingSelectionsByKey instanceof Map && existingSelectionsByKey.has(key)) continue;
        out.set(key, {
            kind: 'line',
            lineIds: new Set(lineIds),
            displayName: toText(getLineName(mainLineId)),
            hidden: false
        });
    }

    return out;
};

export const splitCompanyBaseMultiSelectionState = ({
    selectionsByKey,
    key,
    getLineName = () => '',
    resolveLineSelection = () => null
} = {}) => {
    const baseKey = toText(key);
    const nextSelectionsByKey = toSelectionMap(selectionsByKey);
    if (!baseKey) {
        return { changed: false, selectionsByKey: nextSelectionsByKey };
    }

    const entry = nextSelectionsByKey.get(baseKey);
    const lineEntries = buildSplitCompanyLineSelectionEntries({
        entry,
        existingSelectionsByKey: nextSelectionsByKey,
        getLineName,
        resolveLineSelection
    });
    if (!(lineEntries instanceof Map)) {
        return { changed: false, selectionsByKey: nextSelectionsByKey };
    }

    nextSelectionsByKey.delete(baseKey);
    for (const [lineKey, lineEntry] of lineEntries.entries()) {
        nextSelectionsByKey.set(lineKey, lineEntry);
    }

    return { changed: true, selectionsByKey: nextSelectionsByKey };
};

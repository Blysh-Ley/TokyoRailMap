const toText = (value) => String(value ?? '').trim();

export const buildTransferCapsulePreviewScopeKey = ({
    active = false,
    multiSelectEnabled = false,
    previewSelectionEntries,
    baseSelectedLineIds
} = {}) => {
    if (active !== true || multiSelectEnabled !== true) return '';

    const previewKeys = Array.isArray(previewSelectionEntries)
        ? previewSelectionEntries
            .map(([key, entry]) => `${toText(key)}:${entry?.hidden === true ? '0' : '1'}`)
            .filter(Boolean)
            .sort()
        : [];
    const baseKeys = baseSelectedLineIds instanceof Set
        ? Array.from(baseSelectedLineIds).map(toText).filter(Boolean).sort()
        : [];
    return `preview:${previewKeys.join(',')};base:${baseKeys.join(',')}`;
};

export const buildTransferCapsuleVisibleKey = (visibleIds, options = {}) => {
    const mode = options?.useFixedConnections ? 'fixed' : 'auto';
    const scope = options?.viewportOnly ? 'viewport' : 'final';
    const previewScopeKey = toText(options?.previewScopeKey);
    const prefix = previewScopeKey ? `${mode}:${scope}:${previewScopeKey}:` : `${mode}:${scope}:`;
    if (options?.useFixedConnections && options?.baseHiddenFilterActive) {
        return `${prefix}__base-hidden-filter__`;
    }
    if (!(visibleIds instanceof Set)) return `${prefix}*`;
    if (!visibleIds.size) return `${prefix}__empty__`;
    return `${prefix}${Array.from(visibleIds).map(toText).filter(Boolean).sort().join('|')}`;
};

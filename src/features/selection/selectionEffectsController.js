const normalizeLineIds = (value) => {
    if (value instanceof Set) return Array.from(value).map((id) => String(id)).filter(Boolean);
    if (Array.isArray(value)) return value.map((id) => String(id)).filter(Boolean);
    return [];
};

const getBaseHighlightLineIds = ({
    enabledLineIdsByCompany,
    getBaseMultiSelectedLineIds,
    isMultiSelectModeEnabled,
    selectedCompany,
    selectedLineId,
    selectedStationLineIds
} = {}) => {
    if (isMultiSelectModeEnabled()) {
        const ids = normalizeLineIds(getBaseMultiSelectedLineIds?.());
        if (ids.length) return ids;
    }

    if (selectedLineId) {
        if (selectedStationLineIds && selectedStationLineIds.size > 1) {
            return normalizeLineIds(selectedStationLineIds);
        }
        return [String(selectedLineId)];
    }

    if (selectedStationLineIds && selectedStationLineIds.size) {
        return normalizeLineIds(selectedStationLineIds);
    }

    if (selectedCompany && enabledLineIdsByCompany && enabledLineIdsByCompany.has(selectedCompany)) {
        return normalizeLineIds(enabledLineIdsByCompany.get(selectedCompany));
    }

    return [];
};

const getBaseHighlightKind = ({
    getBaseMultiSelectedLineIds,
    isMultiSelectModeEnabled,
    selectedCompany,
    selectedLineId,
    selectedStationLineIds
} = {}) => {
    if (isMultiSelectModeEnabled() && getBaseMultiSelectedLineIds?.().size) return 'multi-base';
    if (selectedLineId) return 'line';
    if (selectedCompany) return 'company';
    if (selectedStationLineIds && selectedStationLineIds.size) return 'station';
    return 'unknown';
};

export const createSelectionEffectsController = ({
    cancelFrame = (id) => cancelAnimationFrame(id),
    effects = {},
    emitBaseHighlightCleared = () => {},
    emitBaseHighlightUpdated = () => {},
    getBaseMultiSelectedLineIds = () => new Set(),
    getEnabledLineIdsByCompany = () => new Map(),
    getSelectionSnapshot = () => ({}),
    isMultiSelectModeEnabled = () => false,
    requestFrame = (callback) => requestAnimationFrame(callback)
} = {}) => {
    let frameId = null;

    const applyEffectsNow = () => {
        effects.applyBaseLayerVisibilityFilters?.();
        effects.applyLineSelectionStyle?.();
        effects.syncSelectionLineTripPreview?.();
        effects.applyStationSelectionStyle?.();
        effects.updateSelectedStationCurrentPopup?.();
        effects.applyTransferStationLabelCollapse?.();
        effects.updateSelectedStationLabelClass?.();
        effects.updateMultiSelectStationLabelChips?.();
        effects.scheduleSelectionLayerRefresh?.();
        effects.updateSelectionBadge?.();

        try {
            const snapshot = getSelectionSnapshot() || {};
            const enabledLineIdsByCompany = getEnabledLineIdsByCompany() || new Map();
            const context = {
                enabledLineIdsByCompany,
                getBaseMultiSelectedLineIds,
                isMultiSelectModeEnabled,
                selectedCompany: snapshot.selectedCompany || null,
                selectedLineId: snapshot.selectedLineId || null,
                selectedStationId: snapshot.selectedStationId || null,
                selectedStationLineIds: snapshot.selectedStationLineIds instanceof Set
                    ? snapshot.selectedStationLineIds
                    : null
            };

            const lineIds = getBaseHighlightLineIds(context);
            if (!lineIds.length) {
                emitBaseHighlightCleared();
                return;
            }

            emitBaseHighlightUpdated({
                kind: getBaseHighlightKind(context),
                lineIds,
                selectedLineId: context.selectedLineId ? String(context.selectedLineId) : null,
                selectedCompany: context.selectedCompany ? String(context.selectedCompany) : null,
                selectedStationId: context.selectedStationId ? String(context.selectedStationId) : null
            });
        } catch {
            // Selection effects should never break the interaction loop.
        }
    };

    const applySelectionEffects = () => {
        if (frameId != null) cancelFrame(frameId);
        frameId = requestFrame(() => {
            frameId = null;
            applyEffectsNow();
        });
    };

    const destroy = () => {
        if (frameId == null) return;
        cancelFrame(frameId);
        frameId = null;
    };

    return {
        apply: applySelectionEffects,
        destroy
    };
};

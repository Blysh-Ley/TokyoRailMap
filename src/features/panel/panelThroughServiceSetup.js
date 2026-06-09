const toText = (value) => String(value ?? '').trim();

const createEmptyState = () => ({
    temporaryLineMetaById: new Map(),
    temporarySourceLineIdsByDisplayLineId: new Map(),
    temporaryAllowedTripKeysByDisplayLineId: new Map()
});

export const createEmptyPanelThroughServiceState = () => createEmptyState();

export const resolvePanelThroughServiceSetup = ({
    throughPlan = null,
    displayServingIds = []
} = {}) => {
    const state = createEmptyState();
    const nextDisplayServingIds = Array.isArray(displayServingIds) ? displayServingIds : [];

    if (!throughPlan) {
        return {
            ...state,
            displayServingIds: nextDisplayServingIds
        };
    }

    if (throughPlan.temporaryLineMetaById instanceof Map) {
        state.temporaryLineMetaById = throughPlan.temporaryLineMetaById;
    }
    if (throughPlan.temporarySourceLineIdsByDisplayLineId instanceof Map) {
        state.temporarySourceLineIdsByDisplayLineId = throughPlan.temporarySourceLineIdsByDisplayLineId;
    }
    if (throughPlan.temporaryAllowedTripKeysByDisplayLineId instanceof Map) {
        state.temporaryAllowedTripKeysByDisplayLineId = throughPlan.temporaryAllowedTripKeysByDisplayLineId;
    }

    return {
        ...state,
        displayServingIds: Array.isArray(throughPlan.displayServingIds)
            ? throughPlan.displayServingIds
            : nextDisplayServingIds
    };
};

export const applyTemporarySourceLineOverrides = ({
    lineGroupByMainId,
    temporarySourceLineIdsByDisplayLineId,
    normalize = toText
} = {}) => {
    const nextLineGroupByMainId = lineGroupByMainId instanceof Map
        ? new Map(lineGroupByMainId)
        : new Map();

    if (!(temporarySourceLineIdsByDisplayLineId instanceof Map) || !temporarySourceLineIdsByDisplayLineId.size) {
        return nextLineGroupByMainId;
    }

    for (const [displayLineId, sourceLineIds] of temporarySourceLineIdsByDisplayLineId.entries()) {
        const normalizedDisplayLineId = normalize(displayLineId);
        if (!normalizedDisplayLineId) continue;

        const normalizedSourceLineIds = Array.isArray(sourceLineIds)
            ? Array.from(new Set(sourceLineIds.map((value) => normalize(value)).filter(Boolean)))
            : [];
        if (!normalizedSourceLineIds.length) continue;

        nextLineGroupByMainId.set(normalizedDisplayLineId, normalizedSourceLineIds);
    }

    return nextLineGroupByMainId;
};

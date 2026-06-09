const defaultToText = (value) => String(value ?? '').trim();

export const resetPanelStationRenderTransientState = ({
    dirPrintPayloadByKey,
    dirFilterStateByKey,
    clearHoverTimer = () => {},
    clearRestoreTimer = () => {},
    clearTripHighlightTimer = () => {},
    hideTripDetail = () => {},
    closeDirFilterPopover = () => {},
    clearPinnedPanelState = () => {}
} = {}) => {
    dirPrintPayloadByKey?.clear?.();
    dirFilterStateByKey?.clear?.();
    clearHoverTimer();
    clearRestoreTimer();
    clearTripHighlightTimer();
    hideTripDetail();
    closeDirFilterPopover();
    clearPinnedPanelState({ restoreStation: false });

    return {
        pendingGridDataDebugLog: true,
        expandedDirKeys: new Set(),
        lastAppliedHoverKey: null,
        lastMousePrimaryKey: '',
        lastTripDetailKey: null
    };
};

export const preparePanelStationRenderBootstrap = ({
    props,
    normalizeArrayLike = (value) => value,
    buildPanelLineMergeInfo = () => ({ displayLineIds: [] }),
    getLineMeta = () => null,
    createEmptyPanelThroughServiceState = () => ({
        temporaryLineMetaById: new Map(),
        temporarySourceLineIdsByDisplayLineId: new Map(),
        temporaryAllowedTripKeysByDisplayLineId: new Map()
    }),
    toText = defaultToText
} = {}) => {
    const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
    const currentStationServingIds = Array.isArray(servingIdsRaw)
        ? servingIdsRaw.map((value) => toText(value)).filter(Boolean)
        : [];

    const mergeInfo = buildPanelLineMergeInfo({
        servingLineIds: currentStationServingIds,
        getLineMeta
    });

    return {
        currentStationServingIds,
        mergeInfo,
        displayServingIds: Array.isArray(mergeInfo?.displayLineIds)
            ? mergeInfo.displayLineIds
            : currentStationServingIds,
        throughServiceState: createEmptyPanelThroughServiceState()
    };
};

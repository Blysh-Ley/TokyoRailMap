export const buildPanelStationRenderInputs = async ({
    stationId = '',
    stationNameZh = '',
    displayServingIds = [],
    getLineMeta = () => null,
    temporarySourceLineIdsByDisplayLineId,
    buildPanelLineMergeInfo = () => ({ displayLineIds: [], lineGroupByMainId: new Map() }),
    applyTemporarySourceLineOverrides = ({ lineGroupByMainId }) => lineGroupByMainId,
    buildTransferLineStationNameMap = async () => new Map()
} = {}) => {
    const mergedDisplayInfo = buildPanelLineMergeInfo({
        servingLineIds: displayServingIds,
        getLineMeta
    });
    const nextDisplayServingIds = Array.isArray(mergedDisplayInfo?.displayLineIds)
        ? mergedDisplayInfo.displayLineIds
        : displayServingIds;

    const lineGroupByMainId = applyTemporarySourceLineOverrides({
        lineGroupByMainId: mergedDisplayInfo?.lineGroupByMainId instanceof Map
            ? mergedDisplayInfo.lineGroupByMainId
            : new Map(),
        temporarySourceLineIdsByDisplayLineId
    });

    const lineStationNameByLineId = await buildTransferLineStationNameMap({
        stationId,
        stationNameZh,
        servingLineIds: nextDisplayServingIds,
        lineGroupByMainId
    });

    return {
        displayServingIds: nextDisplayServingIds,
        lineGroupByMainId,
        lineStationNameByLineId
    };
};

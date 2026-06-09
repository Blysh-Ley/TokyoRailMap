const defaultToText = (value) => String(value ?? '').trim();

export const preparePanelTripDetailBranchMainFlow = ({
    activeBranchLanes = [],
    buildLineDescriptor = () => null,
    currentLineDesc = null,
    fallbackLineId = '',
    pickPrimaryLaneIndex = () => 0,
    segmentsWithPast = [],
    toText = defaultToText,
    tripLineId = ''
} = {}) => {
    const mainSegWithPast = (Array.isArray(segmentsWithPast) ? segmentsWithPast : [])
        .find((segment) => segment?.kind === 'main') || null;
    const mainRows = Array.isArray(mainSegWithPast?.rows) ? mainSegWithPast.rows : [];
    const resolvedMainLineId = toText(tripLineId) || toText(fallbackLineId);
    const mainDescriptor = currentLineDesc || buildLineDescriptor(resolvedMainLineId);

    const lanes = Array.isArray(activeBranchLanes) ? activeBranchLanes : [];
    const primaryLaneIndex = pickPrimaryLaneIndex(lanes, resolvedMainLineId);
    const orderedLanes = [
        lanes[primaryLaneIndex],
        ...lanes.filter((_, index) => index !== primaryLaneIndex)
    ].filter(Boolean);

    return {
        mainDescriptor,
        mainRows,
        primaryLane: orderedLanes[0] || null,
        secondaryLanes: orderedLanes.slice(1)
    };
};

const defaultToText = (value) => String(value ?? '').trim();

export const buildPanelTripDetailBranchLaneFromChain = ({
    chainTrips,
    kind,
    sourceRefId,
    buildRowsForTrip = () => [],
    mergeStops = (left) => left,
    getTripLineId = () => '',
    buildLineDescriptor = () => null,
    buildRefLineDescriptor = () => null,
    getTripTypeName = () => '',
    getTripTypeColor = () => '',
    trainTypesIndex,
    trainTypeColorIndex,
    toText = defaultToText
} = {}) => {
    const chain = Array.isArray(chainTrips) ? chainTrips : [];
    if (!chain.length) return null;

    let laneRows = [];
    const lanePreviewSegments = [];

    for (const laneTrip of chain) {
        const rows = (Array.isArray(buildRowsForTrip(laneTrip)) ? buildRowsForTrip(laneTrip) : []).map((stop) => ({
            ...stop,
            seg: kind,
            isMain: false
        }));

        const laneStationIds = rows.map((row) => toText(row?.stationId)).filter(Boolean);
        if (laneStationIds.length >= 2) {
            lanePreviewSegments.push({
                kind,
                lineId: toText(getTripLineId(laneTrip)),
                r: toText(getTripLineId(laneTrip)),
                d: toText(laneTrip?.d),
                stationIds: laneStationIds,
                typeColor: toText(getTripTypeColor(laneTrip, trainTypeColorIndex))
            });
        }

        laneRows = mergeStops(laneRows, rows);
    }

    const firstTrip = chain[0] || null;
    return {
        kind,
        lineId: getTripLineId(firstTrip),
        sourceRefId,
        d: toText(firstTrip?.d),
        descriptor: buildLineDescriptor(getTripLineId(firstTrip)) || buildRefLineDescriptor(sourceRefId),
        typeName: getTripTypeName(firstTrip, trainTypesIndex),
        typeColor: getTripTypeColor(firstTrip, trainTypeColorIndex),
        rows: laneRows,
        previewSegments: lanePreviewSegments
    };
};

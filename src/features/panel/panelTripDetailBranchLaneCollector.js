import { buildPanelTripDetailBranchLaneFromChain } from './panelTripDetailBranchLaneBuilder.js';

const defaultToText = (value) => String(value ?? '').trim();

export const collectPanelTripDetailBranchLanesFromRefs = async ({
    refIds = [],
    kind = '',
    collectRefChainTripsFromRef = async () => [],
    isTokenCurrent = () => true,
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
    const ids = Array.isArray(refIds) ? refIds.map((value) => toText(value)).filter(Boolean) : [];
    const lanes = [];

    for (let index = 0; index < ids.length; index += 1) {
        const sourceRefId = ids[index];
        const chainTrips = await collectRefChainTripsFromRef(sourceRefId, kind);
        if (!isTokenCurrent()) return null;

        const chain = Array.isArray(chainTrips) ? chainTrips : [];
        if (!chain.length) continue;

        const lane = buildPanelTripDetailBranchLaneFromChain({
            chainTrips: chain,
            kind,
            sourceRefId,
            buildRowsForTrip,
            mergeStops,
            getTripLineId,
            buildLineDescriptor,
            buildRefLineDescriptor,
            getTripTypeName,
            getTripTypeColor,
            trainTypesIndex,
            trainTypeColorIndex,
            toText
        });
        if (lane) lanes.push(lane);
    }

    return lanes;
};

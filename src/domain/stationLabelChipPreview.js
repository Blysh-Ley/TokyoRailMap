const toText = (value) => String(value ?? '').trim();

// 每轮渲染只遍历一次班次路段，并保留原路段顺序和重复的种别颜色。
export const buildStationLabelPreviewIndex = ({ visibleTripSelections = [], getTransferStationIds = () => null } = {}) => {
    const byStationId = new Map();
    let order = 0;
    for (const entry of visibleTripSelections) {
        if (entry?.hidden === true) continue;
        const payload = entry?.payload || {};
        const segments = Array.isArray(payload.segments) ? payload.segments : [];
        const virtualSegments = Array.isArray(payload.virtualTrips)
            ? payload.virtualTrips.flatMap((trip) => Array.isArray(trip?.segments) ? trip.segments : []) : [];
        const payloadTypeColor = toText(payload.typeColor);
        for (const segment of [...segments, ...virtualSegments]) {
            const lineId = toText(segment?.r || segment?.routeLineId || segment?.lineId);
            if (!lineId) continue;
            const model = { lineId, typeColor: toText(segment?.typeColor || payloadTypeColor), order: order++ };
            const matchingStationIds = new Set();
            for (const value of Array.isArray(segment?.stationIds) ? segment.stationIds : []) {
                const id = toText(value);
                if (!id) continue;
                matchingStationIds.add(id);
                const transferIds = getTransferStationIds(id);
                if (transferIds?.size) for (const transferId of transferIds) {
                    const peer = toText(transferId);
                    if (peer) matchingStationIds.add(peer);
                }
            }
            for (const id of matchingStationIds) {
                if (!byStationId.has(id)) byStationId.set(id, []);
                byStationId.get(id).push(model);
            }
        }
    }
    return byStationId;
};

export const selectStationLabelPreviewSegments = (byStationId, groupedStationIds) => {
    const matches = new Set();
    for (const id of groupedStationIds) for (const segment of byStationId.get(id) || []) matches.add(segment);
    return [...matches].sort((left, right) => left.order - right.order);
};

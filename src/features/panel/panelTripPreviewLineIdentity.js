const defaultToText = (value) => String(value ?? '').trim();

const inferLineIdFromStationId = (stationId, toText = defaultToText) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((x) => toText(x)).filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '';
};

const inferLineIdFromStationIds = (stationIds, toText = defaultToText) => {
    const counts = new Map();
    for (const sid of Array.isArray(stationIds) ? stationIds : []) {
        const id = inferLineIdFromStationId(sid, toText);
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    if (!counts.size) return '';
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0] || '';
};

const isVirtualLineId = (lineId, toText = defaultToText) => {
    const id = toText(lineId);
    return !id
        || id.startsWith('__')
        || id.startsWith('TokyoRail.')
        || id.includes('MenuThrough')
        || id.includes('ThroughService');
};

export const withTripPreviewLineIdentity = (segment, { toText = defaultToText } = {}) => {
    const seg = segment || {};
    const explicitGeometryLineId = toText(seg.geometryLineId || seg.geometry_line_id);
    const explicitOffsetLineId = toText(seg.offsetLineId || seg.line_offset_id);
    const inferredLineId = inferLineIdFromStationIds(seg.stationIds, toText);
    const fallbackLineId = toText(seg.lineId);
    const geometryLineId = !isVirtualLineId(explicitGeometryLineId, toText)
        ? explicitGeometryLineId
        : (!isVirtualLineId(explicitOffsetLineId, toText)
            ? explicitOffsetLineId
            : (inferredLineId || (!isVirtualLineId(fallbackLineId, toText) ? fallbackLineId : '')));
    const offsetLineId = !isVirtualLineId(explicitOffsetLineId, toText)
        ? explicitOffsetLineId
        : geometryLineId;

    return {
        ...seg,
        ...(geometryLineId ? {
            geometryLineId,
            offsetLineId
        } : {})
    };
};

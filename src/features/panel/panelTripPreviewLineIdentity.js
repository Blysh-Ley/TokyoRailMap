const defaultToText = (value) => String(value ?? '').trim();

export const withTripPreviewLineIdentity = (segment, { toText = defaultToText } = {}) => {
    const seg = segment || {};
    const r = toText(seg.r || seg.routeLineId || seg.railwayId || seg.lineId);
    const geometryLineId = toText(seg.geometryLineId || seg.geometry_line_id || r);
    const offsetLineId = toText(seg.offsetLineId || seg.line_offset_id || r || geometryLineId);
    const lineId = toText(seg.lineId || r);

    return {
        ...seg,
        lineId,
        ...(r ? { r } : {}),
        ...(geometryLineId ? { geometryLineId } : {}),
        ...(offsetLineId ? { offsetLineId } : {})
    };
};

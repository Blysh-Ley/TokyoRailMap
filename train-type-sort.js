const toText = (v) => String(v ?? '').trim();

export const TYPE_BASE_SEQUENCE = ['特急', '急行', '准急', '快速', '普通', '各站停车'];

export const resolveTypeBaseIndex = (typeNameRaw) => {
    const typeName = toText(typeNameRaw);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < TYPE_BASE_SEQUENCE.length; i += 1) {
        const kw = TYPE_BASE_SEQUENCE[i];
        if (!typeName.includes(kw)) continue;
        if (i < best) best = i;
    }
    return Number.isFinite(best) ? best : -1;
};

const compareStopCountAsc = (a, b, stopCountByType) => {
    const sa = Number(stopCountByType?.get?.(a));
    const sb = Number(stopCountByType?.get?.(b));
    const hasSa = Number.isFinite(sa);
    const hasSb = Number.isFinite(sb);

    if (hasSa && hasSb && sa !== sb) return sa - sb;
    if (hasSa !== hasSb) return hasSa ? -1 : 1;
    return 0;
};

export const sortTypeNamesByBaseAndStopCount = (typeNames, countByType, stopCountByType) => {
    const names = Array.from(new Set((Array.isArray(typeNames) ? typeNames : []).map((x) => toText(x)).filter(Boolean)));
    return names.sort((a, b) => {
        const ia = resolveTypeBaseIndex(a);
        const ib = resolveTypeBaseIndex(b);
        const aInBase = ia >= 0;
        const bInBase = ib >= 0;

        if (aInBase !== bInBase) return aInBase ? 1 : -1;

        // Base types must follow fixed base order first
        // then apply stop-count ordering only inside the same base group.
        if (aInBase && bInBase && ia !== ib) return ia - ib;

        const stopCmp = compareStopCountAsc(a, b, stopCountByType);
        if (stopCmp) return stopCmp;

        const dc = (Number(countByType?.get?.(b) || 0)) - (Number(countByType?.get?.(a) || 0));
        if (dc) return dc;

        const dl = b.length - a.length;
        if (dl) return dl;

        return String(a).localeCompare(String(b));
    });
};

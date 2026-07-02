const toText = (v) => String(v ?? '').trim();

export const TYPE_BASE_SEQUENCE = ['快特','特急', '急行', '快速','准急', '普通', '各站停车'];

export const LOCAL_STOP_TYPE_NAMES = Object.freeze(['普通', '各站停车']);

const LOCAL_STOP_TYPE_NAME_SET = new Set(LOCAL_STOP_TYPE_NAMES);

export const isLocalStopTypeName = (typeNameRaw) => LOCAL_STOP_TYPE_NAME_SET.has(toText(typeNameRaw));

const getOperatorPrefix = (idRaw) => {
    const id = toText(idRaw);
    if (!id) return '';
    return id.split('.')[0] || '';
};

const getValuesForType = (valueByTypeName, typeName) => {
    const value = valueByTypeName?.get?.(typeName) ?? valueByTypeName?.[typeName];
    if (value instanceof Set) return Array.from(value);
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
};

export const filterPreferredLocalStopTypeNames = (
    typeNamesRaw,
    { currentLineId = '', typeIdsByTypeName = new Map() } = {}
) => {
    const typeNames = Array.from(new Set(
        (Array.isArray(typeNamesRaw) ? typeNamesRaw : [])
            .map((name) => toText(name))
            .filter(Boolean)
    ));
    const localStopNames = typeNames.filter(isLocalStopTypeName);
    if (localStopNames.length < 2) return typeNames;

    const currentOperator = getOperatorPrefix(currentLineId);
    if (!currentOperator) return typeNames;

    const currentOperatorNames = localStopNames.filter((typeName) => (
        getValuesForType(typeIdsByTypeName, typeName)
            .map(getOperatorPrefix)
            .includes(currentOperator)
    ));
    if (currentOperatorNames.length !== 1) return typeNames;

    const preferredName = currentOperatorNames[0];
    return typeNames.filter((typeName) => !isLocalStopTypeName(typeName) || typeName === preferredName);
};

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

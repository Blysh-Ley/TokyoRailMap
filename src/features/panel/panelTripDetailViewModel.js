const defaultToText = (value) => String(value ?? '').trim();

const toArray = (value) => (Array.isArray(value) ? value : (value ? [value] : []));

export const getTripDetailStationAKey = (stationId, toText = defaultToText) => {
    const s = toText(stationId);
    if (!s) return '';
    const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
    while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
        parts.pop();
    }
    return parts.length ? parts[parts.length - 1] : '';
};

export const getTripDetailRefs = (trip, toText = defaultToText) => {
    const ptRefs = toArray(trip?.pt);
    const ntRefs = toArray(trip?.nt);
    return {
        ntRefIds: ntRefs.map((x) => toText(x)).filter(Boolean),
        ntRefs,
        ptRefIds: ptRefs.map((x) => toText(x)).filter(Boolean),
        ptRefs
    };
};

export const buildTripDetailEndpointContext = ({
    trip,
    getStationAKey = (id) => id,
    toText = defaultToText
} = {}) => {
    const { ntRefIds, ntRefs, ptRefIds, ptRefs } = getTripDetailRefs(trip, toText);
    const hasPt = ptRefs.some((x) => !!toText(x));
    const hasNt = ntRefs.some((x) => !!toText(x));
    const dirRaw = toText(trip?.d);
    const isLoopDirection = /Loop/i.test(dirRaw);
    const hideThroughSegmentsForLoop = isLoopDirection && (hasPt || hasNt);
    const originIds = new Set(toArray(trip?.os).map((x) => toText(x)).filter(Boolean));
    const terminalIds = new Set(toArray(trip?.ds).map((x) => toText(x)).filter(Boolean));
    const originAKeys = new Set(Array.from(originIds).map((id) => getStationAKey(id)).filter(Boolean));
    const terminalAKeys = new Set(Array.from(terminalIds).map((id) => getStationAKey(id)).filter(Boolean));

    return {
        dirRaw,
        hasNt,
        hasPt,
        hideThroughSegmentsForLoop,
        isLoopDirection,
        ntRefIds,
        ntRefs,
        originAKeys,
        originIds,
        ptRefIds,
        ptRefs,
        showOriginLabel: !!originIds.size,
        showTerminalLabel: !!terminalIds.size,
        terminalAKeys,
        terminalIds
    };
};

const mergeBoundaryRows = ({
    currFirst,
    prevLast,
    preferCurrentBase = false,
    toText = defaultToText
} = {}) => {
    const base = preferCurrentBase ? currFirst : prevLast;
    return {
        ...base,
        arr: toText(prevLast?.arr) || toText(currFirst?.arr) || null,
        arrPlus: toText(prevLast?.arr) ? !!prevLast?.arrPlus : !!currFirst?.arrPlus,
        dep: toText(currFirst?.dep) || toText(prevLast?.dep) || null,
        depPlus: toText(currFirst?.dep) ? !!currFirst?.depPlus : !!prevLast?.depPlus,
        stationName: toText(base?.stationName) || toText((preferCurrentBase ? prevLast : currFirst)?.stationName)
    };
};

export const mergeTripDetailSegmentsAtBoundaries = ({
    getStationAKey = (id) => id,
    segments,
    toText = defaultToText
} = {}) => {
    const out = (Array.isArray(segments) ? segments : []).map((segment) => ({
        ...segment,
        rows: Array.isArray(segment?.rows) ? segment.rows.slice() : []
    }));

    for (let i = 1; i < out.length; i += 1) {
        const prevSeg = out[i - 1] || null;
        const currSeg = out[i] || null;
        const prevRows = prevSeg?.rows || [];
        const currRows = currSeg?.rows || [];
        if (!prevRows.length || !currRows.length) continue;

        const prevLast = prevRows[prevRows.length - 1];
        const currFirst = currRows[0];
        const prevSid = toText(prevLast?.stationId);
        const currSid = toText(currFirst?.stationId);
        const sameById = prevSid && prevSid === currSid;
        const prevA = getStationAKey(prevSid);
        const currA = getStationAKey(currSid);
        const sameByA = prevA && currA && prevA === currA;
        if (!sameById && !sameByA) continue;

        if (prevSeg?.kind === 'pt') {
            currRows[0] = mergeBoundaryRows({
                currFirst,
                preferCurrentBase: true,
                prevLast,
                toText
            });
            prevRows.pop();
            continue;
        }

        currRows.shift();
        prevRows[prevRows.length - 1] = mergeBoundaryRows({
            currFirst,
            preferCurrentBase: false,
            prevLast,
            toText
        });
    }

    return out;
};

export const markRowsPastByStation = ({
    currentStationId,
    fallbackPast = false,
    rows,
    toText = defaultToText
} = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    const sid = toText(currentStationId);
    const idx = sid ? list.findIndex((s) => toText(s?.stationId) === sid) : -1;
    if (idx >= 0) {
        return list.map((s, rowIndex) => ({
            ...s,
            isPast: rowIndex < idx
        }));
    }
    return list.map((s) => ({
        ...s,
        isPast: !!fallbackPast
    }));
};

export const applyTripDetailPastState = ({
    currentStationId,
    segments,
    toText = defaultToText
} = {}) => {
    const list = Array.isArray(segments) ? segments : [];
    const normalizedStops = list.flatMap((segment) => segment?.rows || []);
    const sid = toText(currentStationId);
    const currentIdx = normalizedStops.findIndex((s) => toText(s?.stationId) === sid && !!s?.isMain);
    const stopsWithPast = normalizedStops.map((s, idx) => ({
        ...s,
        isPast: currentIdx >= 0 ? idx < currentIdx : false
    }));

    let cursor = 0;
    const segmentsWithPast = list.map((segment) => {
        const len = (segment?.rows || []).length;
        const rows = stopsWithPast.slice(cursor, cursor + len);
        cursor += len;
        return { ...segment, rows };
    });

    return {
        currentIdx,
        normalizedStops,
        segmentsWithPast,
        stopsWithPast
    };
};

export const buildTripDetailTitleViewModel = ({
    buildTerminalDisplayLabel = (names) => (Array.isArray(names) ? names.join(' / ') : ''),
    fallbackDestName = '',
    resolveTrainTypeColorForTheme = (color) => color,
    stationNameById = new Map(),
    terminalIds = [],
    toText = defaultToText,
    trainTypeColorIndex = new Map(),
    trainTypesIndex = new Map(),
    trip
} = {}) => {
    const titleTerminalIds = Array.isArray(terminalIds) ? terminalIds.map((x) => toText(x)).filter(Boolean) : [];
    const titleTerminalNames = Array.from(new Set(
        titleTerminalIds.map((id) => toText(stationNameById?.get?.(id) || id)).filter(Boolean)
    ));
    const destName = buildTerminalDisplayLabel(titleTerminalNames) || toText(fallbackDestName);
    const typeId = toText(trip?.y);
    const typeName = typeId ? toText(trainTypesIndex?.get?.(typeId) || typeId) : '';
    const typeColor = typeId ? toText(resolveTrainTypeColorForTheme(trainTypeColorIndex?.get?.(typeId))) : '';

    return {
        destName,
        titlePrefix: `寰€ ${destName || '鏈煡鏂瑰悜'}`.trim(),
        typeColor,
        typeId,
        typeName
    };
};

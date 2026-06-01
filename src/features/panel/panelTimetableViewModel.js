const defaultToText = (value) => String(value ?? '').trim();

export const normalizeTimetableAllowedTripKeys = (allowedTripKeySet, {
    toText = defaultToText
} = {}) => {
    if (allowedTripKeySet instanceof Set) return allowedTripKeySet;
    if (!Array.isArray(allowedTripKeySet)) return null;
    const out = new Set(allowedTripKeySet.map((x) => toText(x)).filter(Boolean));
    return out.size ? out : null;
};

export const normalizeTimetableSourceLineIds = ({
    lineId,
    sourceLineIds,
    toText = defaultToText
} = {}) => Array.from(new Set(
    (Array.isArray(sourceLineIds) ? sourceLineIds : [lineId])
        .map((x) => toText(x))
        .filter(Boolean)
));

const rowPickScore = (row, {
    toText = defaultToText
} = {}) => {
    let score = 0;
    if (toText(row?.dep)) score += 10;
    if (toText(row?.typeName)) score += 5;
    if (toText(row?.typeColor)) score += 2;
    if (toText(row?.terminalName) || toText(row?.destName)) score += 1;
    return score;
};

const mergeRowMetadata = (primary, secondary, {
    toText = defaultToText
} = {}) => {
    const out = { ...(primary || {}) };
    const other = secondary || {};

    if (!toText(out.arr) && toText(other.arr)) {
        out.arr = other.arr;
        out.arrPlus = !!other.arrPlus;
    }
    if (!toText(out.dep) && toText(other.dep)) {
        out.dep = other.dep;
        out.depPlus = !!other.depPlus;
    }

    out.showOriginLabel = !!(out.showOriginLabel || other.showOriginLabel);
    out.showTerminalLabel = !!(out.showTerminalLabel || other.showTerminalLabel);

    if (!toText(out.typeName) && toText(other.typeName)) out.typeName = other.typeName;
    if (!toText(out.typeColor) && toText(other.typeColor)) out.typeColor = other.typeColor;
    if (!toText(out.originId) && toText(other.originId)) out.originId = other.originId;
    if (!toText(out.originName) && toText(other.originName)) out.originName = other.originName;
    if (!toText(out.terminalId) && toText(other.terminalId)) out.terminalId = other.terminalId;
    if (!toText(out.terminalName) && toText(other.terminalName)) out.terminalName = other.terminalName;
    if (!toText(out.terminalDisplayName) && toText(other.terminalDisplayName)) out.terminalDisplayName = other.terminalDisplayName;
    if (!Array.isArray(out.terminalNames) || !out.terminalNames.length) {
        out.terminalNames = Array.isArray(other.terminalNames) ? other.terminalNames.slice() : [];
    }
    if (!Array.isArray(out.terminalIds) || !out.terminalIds.length) {
        out.terminalIds = Array.isArray(other.terminalIds) ? other.terminalIds.slice() : [];
    }

    out.specialNames = Array.from(new Set([
        ...(Array.isArray(out.specialNames) ? out.specialNames : []),
        ...(Array.isArray(other.specialNames) ? other.specialNames : [])
    ].map((x) => toText(x)).filter(Boolean)));
    out.hasNameMeta = !!(out.hasNameMeta || other.hasNameMeta);
    out.originIdsCount = Math.max(Number(out.originIdsCount) || 0, Number(other.originIdsCount) || 0);
    out.terminalIdsCount = Math.max(Number(out.terminalIdsCount) || 0, Number(other.terminalIdsCount) || 0);
    out.hasNt = !!(out.hasNt || other.hasNt);
    out.resolvedTerminalIdsCount = Math.max(Number(out.resolvedTerminalIdsCount) || 0, Number(other.resolvedTerminalIdsCount) || 0);

    return out;
};

export const mergeDuplicateTimetableRows = (rows, {
    toText = defaultToText
} = {}) => {
    const merged = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
        const base = toText(row?.baseTripKey) || toText(row?.tripKey);
        const dirKey = toText(row?.dir) || 'Unknown';
        const timeMs = Number(row?.timeMs);
        if (!base || !Number.isFinite(timeMs)) {
            merged.set(Symbol('row'), row);
            continue;
        }

        const key = `${base}||${dirKey}||${timeMs}`;
        const prev = merged.get(key);
        if (!prev) {
            merged.set(key, row);
            continue;
        }

        const keepRow = rowPickScore(row, { toText }) > rowPickScore(prev, { toText });
        const primary = keepRow ? row : prev;
        const secondary = keepRow ? prev : row;
        merged.set(key, mergeRowMetadata(primary, secondary, { toText }));
    }

    return Array.from(merged.values());
};

export const deriveDirectionStats = (rows, {
    destNameMinCount = 0,
    toText = defaultToText
} = {}) => {
    const inputRows = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : []);
    const minCount = Number(rows?.destNameMinCount ?? destNameMinCount) || 0;
    const dirToDestCounts = new Map();
    const dirOrder = [];
    const dirSeen = new Set();

    for (const row of inputRows) {
        const dirKey = toText(row?.dir) || 'Unknown';
        if (!dirToDestCounts.has(dirKey)) dirToDestCounts.set(dirKey, new Map());
        if (!dirSeen.has(dirKey)) {
            dirSeen.add(dirKey);
            dirOrder.push(dirKey);
        }
        const counts = dirToDestCounts.get(dirKey);
        const names = Array.isArray(row?.destNamesForDir) ? row.destNamesForDir : [];
        for (const name of names) {
            const label = toText(name);
            if (!label) continue;
            counts.set(label, (counts.get(label) || 0) + 1);
        }
    }

    let anyDestAboveThreshold = false;
    for (const counts of dirToDestCounts.values()) {
        for (const count of counts.values()) {
            if (Number(count) >= minCount) {
                anyDestAboveThreshold = true;
                break;
            }
        }
        if (anyDestAboveThreshold) break;
    }

    const dirMetrics = new Map();
    for (const dirKey of dirOrder) {
        const counts = dirToDestCounts.get(dirKey) || new Map();
        let maxCount = 0;
        let sumCount = 0;
        for (const count of counts.values()) {
            const n = Number(count) || 0;
            sumCount += n;
            if (n > maxCount) maxCount = n;
        }
        const rowsForDirLen = inputRows.filter((row) => (toText(row?.dir) || 'Unknown') === dirKey).length;
        if (!sumCount) sumCount = rowsForDirLen;
        if (!maxCount) maxCount = rowsForDirLen ? Math.max(1, Math.floor(rowsForDirLen / 2)) : 0;
        dirMetrics.set(dirKey, { maxCount, sumCount });
    }

    dirOrder.sort((a, b) => {
        const ma = dirMetrics.get(a) || { maxCount: 0, sumCount: 0 };
        const mb = dirMetrics.get(b) || { maxCount: 0, sumCount: 0 };
        if (mb.maxCount !== ma.maxCount) return mb.maxCount - ma.maxCount;
        if (mb.sumCount !== ma.sumCount) return mb.sumCount - ma.sumCount;
        return String(a).localeCompare(String(b));
    });

    return {
        anyDestAboveThreshold,
        dirMetrics,
        dirOrder,
        dirToDestCounts
    };
};

export const buildTimetablePrintPayload = ({
    companyLogoMap = {},
    currentStationName = '',
    dirKey,
    dirLabel,
    generatedAt = Date.now(),
    getCompanyLogoSrc = () => '',
    gridHintsHtml = '',
    gridHtml = '',
    lineId,
    lineMeta = {},
    listHtml = '',
    serviceDay = '',
    timetableViewMode = '',
    titleText = '',
    toText = defaultToText
} = {}) => {
    const companyKey = toText(lineMeta?.company);
    const companyInfo = companyLogoMap?.[companyKey] || {};
    return {
        companyLogoSrc: toText(getCompanyLogoSrc(companyKey, companyLogoMap)),
        companyName: toText(companyInfo?.zh) || companyKey || '鏈煡鍏徃',
        companyType: toText(companyInfo?.type) || '',
        dirKey: toText(dirKey),
        dirLabel: toText(dirLabel),
        generatedAt,
        gridHintsHtml,
        gridHtml,
        lineColor: toText(lineMeta?.color),
        lineId: toText(lineId),
        lineName: toText(lineMeta?.name) || toText(lineId),
        listHtml,
        serviceDay: toText(serviceDay),
        stationName: toText(currentStationName) || toText(titleText),
        timetableViewMode
    };
};

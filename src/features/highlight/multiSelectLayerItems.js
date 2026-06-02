const toText = (value) => String(value ?? '').trim();

const toLineIds = (value) => {
    if (value instanceof Set) return Array.from(value).map(toText).filter(Boolean);
    if (Array.isArray(value)) return value.map(toText).filter(Boolean);
    return [];
};

export const buildMultiSelectLayerItemsFromInputs = ({
    baseTripPreviewSource = '',
    baseSelectionsByKey,
    excludeTripPreviewSource = '',
    formatBranchLineName = (lineName) => lineName,
    getBaseKindName = () => '',
    getBranchSource = () => '',
    getLineName = (lineId) => lineId,
    getStationName = (stationId) => stationId,
    hasLineName = () => false,
    hasTripPreviewSelectionBySource = () => false,
    resolveTripPreviewPayloadSource,
    tripPreviewSelectionEntries
} = {}) => {
    const items = [];
    const baseEntries = baseSelectionsByKey instanceof Map ? baseSelectionsByKey.entries() : [];
    const tripEntries = Array.isArray(tripPreviewSelectionEntries) ? tripPreviewSelectionEntries : [];
    const basePreviewSource = toText(baseTripPreviewSource);
    const baseSelectionByFirstLineId = new Map();
    const baseLineKeysRenderedFromTripPreview = new Set();

    if (baseSelectionsByKey instanceof Map) {
        for (const [rawKey, entry] of baseSelectionsByKey.entries()) {
            const key = toText(rawKey);
            if (!key || toText(entry?.kind) !== 'line') continue;
            const firstLineId = toLineIds(entry?.lineIds)[0] || '';
            if (!firstLineId) continue;
            baseSelectionByFirstLineId.set(firstLineId, { key, entry });
        }
    }

    if (basePreviewSource) {
        for (const [_rawKey, entry] of tripEntries) {
            const payload = entry?.payload || {};
            const source = toText(entry?.source) || toText(resolveTripPreviewPayloadSource?.(payload));
            if (source !== basePreviewSource) continue;

            const virtualTrips = Array.isArray(payload?.virtualTrips) ? payload.virtualTrips : [];
            for (const trip of virtualTrips) {
                const tripPayload = trip || {};
                const selectedLineId = toText(tripPayload?.selectedLineId);
                const mainLineId = toText(tripPayload?.mainLineId);
                const segmentLineIds = Array.isArray(tripPayload?.segments)
                    ? tripPayload.segments.map((seg) => toText(seg?.lineId)).filter(Boolean)
                    : [];
                const lineIdCandidates = [selectedLineId, mainLineId, ...segmentLineIds].filter(Boolean);
                const lineId = lineIdCandidates.find((id) => baseSelectionByFirstLineId.has(id))
                    || lineIdCandidates[0]
                    || '';
                const baseRef = baseSelectionByFirstLineId.get(lineId);
                if (!baseRef) continue;

                const branchSource = getBranchSource(lineId);
                baseLineKeysRenderedFromTripPreview.add(baseRef.key);
                items.push({
                    id: `base:${baseRef.key}`,
                    scope: 'base',
                    key: baseRef.key,
                    visible: baseRef.entry?.hidden !== true && entry?.hidden !== true,
                    lineName: toText(tripPayload?.selectedLineName || tripPayload?.lineName || tripPayload?.mainLineName)
                        || getLineName(lineId),
                    originName: '-',
                    terminalName: '-',
                    typeName: getBaseKindName(baseRef.entry?.kind),
                    branchToggleSupported: !!lineId,
                    branchVisible: branchSource
                        ? hasTripPreviewSelectionBySource(branchSource)
                        : false,
                    source: basePreviewSource
                });
            }
        }
    }

    for (const [rawKey, entry] of baseEntries) {
        const key = toText(rawKey);
        if (!key) continue;
        if (baseLineKeysRenderedFromTripPreview.has(key)) continue;

        const ids = toLineIds(entry?.lineIds);
        const firstLineId = ids[0] || '';
        const kind = toText(entry?.kind);
        const fallbackCompanyName = key.startsWith('company:') ? key.slice('company:'.length) : '';
        const baseDisplayName = toText(entry?.displayName);
        const branchSource = getBranchSource(firstLineId);

        items.push({
            id: `base:${key}`,
            scope: 'base',
            key,
            visible: entry?.hidden !== true,
            lineName: kind === 'company'
                ? (baseDisplayName || fallbackCompanyName || getLineName(firstLineId))
                : getLineName(firstLineId),
            originName: '-',
            terminalName: '-',
            typeName: getBaseKindName(entry?.kind),
            branchToggleSupported: kind === 'line' && !!firstLineId,
            branchVisible: kind === 'line' && !!branchSource
                ? hasTripPreviewSelectionBySource(branchSource)
                : false
        });
    }

    const excludedSource = toText(excludeTripPreviewSource);

    for (const [rawKey, entry] of tripEntries) {
        const key = toText(rawKey);
        if (!key) continue;

        const payload = entry?.payload || {};
        const built = entry?.built || {};
        const builtLineIds = toLineIds(built?.lineIds);
        const selectedLineId = toText(payload?.selectedLineId);
        const mainLineId = toText(payload?.mainLineId);
        const lineIdCandidates = [selectedLineId, mainLineId, ...builtLineIds].filter(Boolean);
        const lineId = lineIdCandidates.find((id) => hasLineName(id)) || lineIdCandidates[0] || '';
        const source = toText(entry?.source) || toText(resolveTripPreviewPayloadSource?.(payload));
        if (source && source === excludedSource) continue;

        const isBranchSource = source.startsWith('ms-line-branch:');
        const typeName = toText(payload?.typeName || payload?.tripTypeName) || '-';
        const originName = getStationName(built?.startStationId || payload?.originStationId || '');
        const terminalName = getStationName(built?.endStationId || payload?.terminalStationId || '');
        const baseLineName = toText(payload?.selectedLineName || payload?.lineName || payload?.mainLineName)
            || getLineName(lineId);
        const displayLineName = isBranchSource ? formatBranchLineName(baseLineName) : baseLineName;

        items.push({
            id: `trip:${key}`,
            scope: 'trip',
            key,
            visible: entry?.hidden !== true,
            lineName: displayLineName,
            originName,
            terminalName,
            typeName,
            displayText: isBranchSource ? displayLineName : ''
        });
    }

    return items;
};

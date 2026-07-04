import { resolveMainLineIdForIcon } from '../../lib/line-icons.js';

import { getCachedJson } from '../../lib/fetch.js';


// panelServingLineMerge.js
const toText_panelServingLineMerge = (value) => String(value ?? '').trim();

export const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];

    const text = value.trim();
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return text ? [text] : [];
};

export const buildPanelLineMergeInfo = ({ servingLineIds, getLineMeta } = {}) => {
    const ids = Array.from(new Set(
        (Array.isArray(servingLineIds) ? servingLineIds : [])
            .map((value) => toText_panelServingLineMerge(value))
            .filter(Boolean)
    ));
    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const idIndex = new Map(ids.map((id) => [id, true]));

    const lineGroupByMainId = new Map();
    const displayLineIds = [];

    for (const id of ids) {
        const resolvedMainId = toText_panelServingLineMerge(resolveMainLineIdForIcon(id)) || id;

        let mainId = id;
        if (resolvedMainId && resolvedMainId !== id && idIndex.has(resolvedMainId)) {
            const sourceCompany = toText_panelServingLineMerge(safeGetLineMeta(id)?.company);
            const targetCompany = toText_panelServingLineMerge(safeGetLineMeta(resolvedMainId)?.company);
            const sameCompany = !sourceCompany || !targetCompany || sourceCompany === targetCompany;
            if (sameCompany) mainId = resolvedMainId;
        }

        if (!lineGroupByMainId.has(mainId)) {
            lineGroupByMainId.set(mainId, []);
            displayLineIds.push(mainId);
        }
        lineGroupByMainId.get(mainId).push(id);
    }

    for (const [mainId, groupedIds] of lineGroupByMainId.entries()) {
        const dedupedIds = Array.from(new Set(groupedIds));
        if (dedupedIds.includes(mainId)) {
            dedupedIds.sort((left, right) => {
                if (left === mainId) return -1;
                if (right === mainId) return 1;
                return 0;
            });
        }
        lineGroupByMainId.set(mainId, dedupedIds);
    }

    return { displayLineIds, lineGroupByMainId };
};

// panelStationIdResolver.js
const defaultToText_panelStationIdResolver = (value) => String(value ?? '').trim();

const isPanelStationIdForLine = (stationId, lineId, {
    toText = defaultToText_panelStationIdResolver
} = {}) => {
    const sid = toText(stationId);
    const routeId = toText(lineId);
    return !!sid && !!routeId && (sid === routeId || sid.startsWith(`${routeId}.`));
};

export const resolvePanelStationIdForLine = async ({
    lineId = '',
    currentStationId = '',
    currentStationNameZh = '',
    getStationGroupsIndex = async () => new Map(),
    getStationsIndex = async () => ({ stationIdByRailwayAndNameZh: new Map() }),
    toText = defaultToText_panelStationIdResolver
} = {}) => {
    const routeId = toText(lineId);
    if (!routeId) return null;

    const stationId = toText(currentStationId);
    if (stationId && (stationId === routeId || stationId.startsWith(`${routeId}.`))) {
        return stationId;
    }

    try {
        const groupsIndex = await getStationGroupsIndex();
        const groupIds = stationId ? groupsIndex?.get?.(stationId) : null;
        if (Array.isArray(groupIds) && groupIds.length) {
            for (const candidate of groupIds) {
                const value = toText(candidate);
                if (!value) continue;
                if (value === routeId || value.startsWith(`${routeId}.`)) return value;
            }
        }
    } catch {
        // Preserve panel behavior: station-group lookup is best-effort.
    }

    const stationName = toText(currentStationNameZh);
    if (!stationName) return stationId || null;

    const stationsIndex = await getStationsIndex();
    const hit = stationsIndex?.stationIdByRailwayAndNameZh?.get?.(`${routeId}||${stationName}`);
    return hit || stationId || null;
};

export const resolvePanelComputationStationIdForLine = async ({
    lineId = '',
    currentStationId = '',
    currentStationNameZh = '',
    getStationGroupsIndex = async () => new Map(),
    getStationsIndex = async () => ({ stationIdByRailwayAndNameZh: new Map() }),
    toText = defaultToText_panelStationIdResolver
} = {}) => {
    const routeId = toText(lineId);
    if (!routeId) return null;

    const resolved = await resolvePanelStationIdForLine({
        lineId,
        currentStationId,
        currentStationNameZh,
        getStationGroupsIndex,
        getStationsIndex,
        toText
    });
    if (isPanelStationIdForLine(resolved, routeId, { toText })) return resolved;

    const stationId = toText(currentStationId);
    let groupIds = [];
    try {
        const groupsIndex = await getStationGroupsIndex();
        const rawGroupIds = stationId ? groupsIndex?.get?.(stationId) : null;
        groupIds = Array.isArray(rawGroupIds)
            ? rawGroupIds.map((value) => toText(value)).filter(Boolean)
            : [];
    } catch {
        groupIds = [];
    }

    if (groupIds.length) {
        const stationsIndex = await getStationsIndex();
        const seenNames = new Set();
        for (const candidate of groupIds) {
            const groupStationName = toText(stationsIndex?.idToNameZh?.get?.(candidate));
            if (!groupStationName || seenNames.has(groupStationName)) continue;
            seenNames.add(groupStationName);
            const hit = stationsIndex?.stationIdByRailwayAndNameZh?.get?.(`${routeId}||${groupStationName}`);
            if (isPanelStationIdForLine(hit, routeId, { toText })) return hit;
        }
    }

    return resolved || stationId || null;
};

// panelStationMetadata.js
const defaultToText_panelStationMetadata = (value) => String(value ?? '').trim();

export const readStationName = (props, {
    toText = defaultToText_panelStationMetadata
} = {}) => {
    const value = props || {};
    return toText(value.name_zh || value['name:zh'] || value.name || value.name_ja || value['name:ja'] || '');
};

export const pickTitleZhHans = (titleObj, {
    toText = defaultToText_panelStationMetadata
} = {}) => toText(
    titleObj?.zhHans ||
    titleObj?.['zh-Hans'] ||
    titleObj?.zhHant ||
    titleObj?.['zh-Hant'] ||
    titleObj?.zh ||
    titleObj?.ja ||
    titleObj?.en ||
    ''
);

export const pickTitleEn = (titleObj, {
    toText = defaultToText_panelStationMetadata
} = {}) => toText(titleObj?.en || titleObj?.['en-US'] || titleObj?.ja || '');

let stationsIndexPromise_panelStationMetadata = null;
let stationGroupsIndexPromise_panelStationMetadata = null;
let trainTypesIndexPromise_panelStationMetadata = null;
let trainTypeColorIndexPromise_panelStationMetadata = null;

export const resetPanelStationMetadataCachesForTest = () => {
    stationsIndexPromise_panelStationMetadata = null;
    stationGroupsIndexPromise_panelStationMetadata = null;
    trainTypesIndexPromise_panelStationMetadata = null;
    trainTypeColorIndexPromise_panelStationMetadata = null;
};

export const getStationsIndex = async ({
    toText = defaultToText_panelStationMetadata,
    loadJson = getCachedJson
} = {}) => {
    if (stationsIndexPromise_panelStationMetadata) return stationsIndexPromise_panelStationMetadata;
    stationsIndexPromise_panelStationMetadata = (async () => {
        try {
            const list = await loadJson('./data/stations.json');
            const idToNameZh = new Map();
            const idToNameEn = new Map();
            const idToCode = new Map();
            const stationIdByRailwayAndNameZh = new Map();
            for (const station of Array.isArray(list) ? list : []) {
                const id = toText(station?.id);
                if (!id) continue;
                const name = pickTitleZhHans(station?.title, { toText }) || id;
                const nameEn = pickTitleEn(station?.title, { toText });
                const code = toText(station?.code || station?.title?.code);
                idToNameZh.set(id, name);
                if (nameEn) idToNameEn.set(id, nameEn);
                if (code) idToCode.set(id, code);
                const railway = toText(station?.railway || station?.r);
                if (railway && name) {
                    stationIdByRailwayAndNameZh.set(`${railway}||${name}`, id);
                }
            }
            return { idToCode, idToNameEn, idToNameZh, stationIdByRailwayAndNameZh };
        } catch {
            return {
                idToCode: new Map(),
                idToNameEn: new Map(),
                idToNameZh: new Map(),
                stationIdByRailwayAndNameZh: new Map()
            };
        }
    })();
    return stationsIndexPromise_panelStationMetadata;
};

export const getStationGroupsIndex = async ({
    toText = defaultToText_panelStationMetadata,
    loadJson = getCachedJson
} = {}) => {
    if (stationGroupsIndexPromise_panelStationMetadata) return stationGroupsIndexPromise_panelStationMetadata;
    stationGroupsIndexPromise_panelStationMetadata = (async () => {
        try {
            const list = await loadJson('./data/station-groups.json');
            let stations = [];
            try {
                const stationList = await loadJson('./data/stations.json');
                stations = Array.isArray(stationList) ? stationList : [];
            } catch {
                stations = [];
            }
            const alternateStationIdById = new Map();
            for (const station of stations) {
                const id = toText(station?.id);
                const alternate = toText(station?.alternate);
                if (id && alternate) alternateStationIdById.set(id, alternate);
            }
            const map = new Map();
            for (const group of Array.isArray(list) ? list : []) {
                const rawIds = Array.isArray(group?.ids)
                    ? group.ids
                    : (Array.isArray(group) ? group.flat(Infinity) : []);
                const rawGroupIds = rawIds.map((value) => toText(value)).filter(Boolean);
                const rawGroupSet = new Set(rawGroupIds);
                const visibleIds = rawGroupIds.filter((id) => {
                    const alternate = alternateStationIdById.get(id);
                    return !(alternate && rawGroupSet.has(alternate));
                });
                const ids = visibleIds.length ? visibleIds : rawGroupIds;
                if (!ids.length) continue;
                for (const id of ids) {
                    const existing = map.get(id) || [];
                    const mergedSeen = new Set(existing);
                    const merged = existing.slice();
                    for (const value of ids) {
                        if (mergedSeen.has(value)) continue;
                        mergedSeen.add(value);
                        merged.push(value);
                    }
                    map.set(id, merged);
                }
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return stationGroupsIndexPromise_panelStationMetadata;
};

export const getTrainTypesIndex = async ({
    toText = defaultToText_panelStationMetadata,
    loadJson = getCachedJson
} = {}) => {
    if (trainTypesIndexPromise_panelStationMetadata) return trainTypesIndexPromise_panelStationMetadata;
    trainTypesIndexPromise_panelStationMetadata = (async () => {
        try {
            const list = await loadJson('./data/train-types.json');
            const map = new Map();
            for (const item of Array.isArray(list) ? list : []) {
                const id = toText(item?.id);
                if (!id) continue;
                map.set(id, pickTitleZhHans(item?.title, { toText }) || id);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypesIndexPromise_panelStationMetadata;
};

export const getTrainTypeColorIndex = async ({
    toText = defaultToText_panelStationMetadata,
    loadJson = getCachedJson
} = {}) => {
    if (trainTypeColorIndexPromise_panelStationMetadata) return trainTypeColorIndexPromise_panelStationMetadata;
    trainTypeColorIndexPromise_panelStationMetadata = (async () => {
        try {
            const list = await loadJson('./data/train-types.json');
            const map = new Map();
            for (const item of Array.isArray(list) ? list : []) {
                const id = toText(item?.id);
                if (!id) continue;
                const color = toText(item?.title?.color);
                if (!color) continue;
                map.set(id, color);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypeColorIndexPromise_panelStationMetadata;
};

export const buildTransferLineStationNameMap = async ({
    stationId,
    stationNameZh,
    servingLineIds,
    lineGroupByMainId,
    toText = defaultToText_panelStationMetadata,
    getGroupsIndex = () => getStationGroupsIndex({ toText }),
    getStationsIndexFn = () => getStationsIndex({ toText }),
    resolveMainLineId = resolveMainLineIdForIcon
} = {}) => {
    const sid = toText(stationId);
    const clickedName = toText(stationNameZh);
    const lineIds = Array.isArray(servingLineIds) ? servingLineIds.map((value) => toText(value)).filter(Boolean) : [];
    const grouped = lineGroupByMainId instanceof Map ? lineGroupByMainId : new Map();
    const out = new Map();
    if (!sid || !lineIds.length) return out;

    const getGroupNameCount = (stationsIndex, ids) => new Set(
        (Array.isArray(ids) ? ids : [])
            .map((id) => toText(stationsIndex?.idToNameZh?.get?.(id) || ''))
            .filter(Boolean)
    ).size;

    try {
        const [groupsIndex, stationsIndex] = await Promise.all([getGroupsIndex(), getStationsIndexFn()]);
        const groupIdsRaw = groupsIndex?.get?.(sid);
        const groupIds = Array.isArray(groupIdsRaw) && groupIdsRaw.length
            ? groupIdsRaw.map((value) => toText(value)).filter(Boolean)
            : [sid];
        const currentStationHasMultipleNames = getGroupNameCount(stationsIndex, groupIds) > 1;

        for (const lineId of lineIds) {
            const mergedSourceLineIds = Array.from(new Set([
                lineId,
                ...(Array.isArray(grouped.get(lineId)) ? grouped.get(lineId) : [])
            ].map((value) => toText(value)).filter(Boolean)));

            const sourceLineIds = Array.from(new Set(mergedSourceLineIds.flatMap((value) => {
                const resolved = toText(resolveMainLineId(value)) || value;
                return resolved && resolved !== value ? [value, resolved] : [value];
            })));

            let candidateId = '';
            for (const srcLineId of sourceLineIds) {
                candidateId = toText(groupIds.find((gid) => gid === srcLineId || gid.startsWith(`${srcLineId}.`)) || '');
                if (candidateId) break;
            }

            if (!candidateId && clickedName) {
                for (const srcLineId of sourceLineIds) {
                    candidateId = toText(stationsIndex?.stationIdByRailwayAndNameZh?.get?.(`${srcLineId}||${clickedName}`) || '');
                    if (candidateId) break;
                }
            }

            if (!candidateId) continue;

            const candidateGroupIdsRaw = groupsIndex?.get?.(candidateId);
            const candidateGroupIds = Array.isArray(candidateGroupIdsRaw) && candidateGroupIdsRaw.length
                ? candidateGroupIdsRaw.map((value) => toText(value)).filter(Boolean)
                : [candidateId];
            const transferNameRaw = toText(stationsIndex?.idToNameZh?.get?.(candidateId) || '');
            const transferCode = toText(stationsIndex?.idToCode?.get?.(candidateId) || '');
            const transferHasMultipleNames = getGroupNameCount(stationsIndex, candidateGroupIds) > 1;
            const transferName = currentStationHasMultipleNames && transferHasMultipleNames
                ? transferNameRaw
                : '';

            out.set(lineId, {
                stationId: candidateId,
                name: transferName,
                code: transferCode,
                actualName: transferNameRaw
            });
        }
    } catch {
        return out;
    }

    return out;
};

// panelStationRenderBootstrap.js
const defaultToText_panelStationRenderBootstrap = (value) => String(value ?? '').trim();

export const resetPanelStationRenderTransientState = ({
    dirPrintPayloadByKey,
    dirFilterStateByKey,
    dirFilterRowsByKey,
    dirFilteredTripKeysByKey,
    dirPreviewMetaByKey,
    clearHoverTimer = () => {},
    clearRestoreTimer = () => {},
    clearTripHighlightTimer = () => {},
    hideTripDetail = () => {},
    closeDirFilterPopover = () => {},
    clearPinnedPanelState = () => {}
} = {}) => {
    dirPrintPayloadByKey?.clear?.();
    dirFilterStateByKey?.clear?.();
    dirFilterRowsByKey?.clear?.();
    dirFilteredTripKeysByKey?.clear?.();
    dirPreviewMetaByKey?.clear?.();
    clearHoverTimer();
    clearRestoreTimer();
    clearTripHighlightTimer();
    hideTripDetail();
    closeDirFilterPopover();
    clearPinnedPanelState({ restoreStation: false });

    return {
        pendingGridDataDebugLog: true,
        expandedDirKeys: new Set(),
        lastAppliedHoverKey: null,
        lastMousePrimaryKey: '',
        lastTripDetailKey: null
    };
};

// panelStationRestoreContext.js
const defaultToText_panelStationRestoreContext = (value) => String(value ?? '').trim();

const normalizeRestoreLineIds = (value, toTextFn) => (
    Array.isArray(value) ? value.map((entry) => toTextFn(entry)).filter(Boolean) : []
);

const sameRestoreLineIds = (left, right) => (
    left.length === right.length && left.every((value, index) => value === right[index])
);

export const createPanelStationRestoreContext = ({
    toText = defaultToText_panelStationRestoreContext
} = {}) => {
    let sessionId = 0;
    let current = null;

    const snapshot = () => (
        current
            ? {
                sessionId: current.sessionId,
                stationId: current.stationId,
                servingIds: current.servingIds.slice()
            }
            : null
    );

    const set = (stationIdValue, servingIdsValue) => {
        const stationId = toText(stationIdValue);
        const servingIds = normalizeRestoreLineIds(servingIdsValue, toText);
        sessionId += 1;
        current = stationId
            ? {
                sessionId,
                stationId,
                servingIds
            }
            : null;
        return snapshot();
    };

    const invalidate = () => {
        sessionId += 1;
        current = null;
    };

    const getSnapshot = (stationIdValue = '') => {
        if (!current) return null;
        const stationId = toText(stationIdValue);
        if (stationId && stationId !== current.stationId) return null;
        return snapshot();
    };

    const get = (stationIdValue = '') => {
        const value = getSnapshot(stationIdValue);
        return value
            ? {
                stationId: value.stationId,
                servingIds: value.servingIds
            }
            : null;
    };

    const canRestore = ({ stationId, lineIds, sessionId: candidateSessionId } = {}) => {
        if (!current) return false;
        if (candidateSessionId != null && Number(candidateSessionId) !== current.sessionId) return false;
        if (toText(stationId) !== current.stationId) return false;
        return sameRestoreLineIds(normalizeRestoreLineIds(lineIds, toText), current.servingIds);
    };

    return {
        canRestore,
        get,
        getSnapshot,
        invalidate,
        set
    };
};

export const preparePanelStationRenderBootstrap = ({
    props,
    normalizeArrayLike = (value) => value,
    buildPanelLineMergeInfo = () => ({ displayLineIds: [] }),
    getLineMeta = () => null,
    createEmptyPanelThroughServiceState = () => ({
        temporaryLineMetaById: new Map(),
        temporarySourceLineIdsByDisplayLineId: new Map(),
        temporaryAllowedTripKeysByDisplayLineId: new Map()
    }),
    toText = defaultToText_panelStationRenderBootstrap
} = {}) => {
    const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
    const currentStationServingIds = Array.isArray(servingIdsRaw)
        ? servingIdsRaw.map((value) => toText(value)).filter(Boolean)
        : [];

    const mergeInfo = buildPanelLineMergeInfo({
        servingLineIds: currentStationServingIds,
        getLineMeta
    });

    return {
        currentStationServingIds,
        mergeInfo,
        displayServingIds: Array.isArray(mergeInfo?.displayLineIds)
            ? mergeInfo.displayLineIds
            : currentStationServingIds,
        throughServiceState: createEmptyPanelThroughServiceState()
    };
};

// panelStationRenderInputs.js
export const buildPanelStationRenderInputs = async ({
    stationId = '',
    stationNameZh = '',
    displayServingIds = [],
    getLineMeta = () => null,
    temporarySourceLineIdsByDisplayLineId,
    buildPanelLineMergeInfo = () => ({ displayLineIds: [], lineGroupByMainId: new Map() }),
    applyTemporarySourceLineOverrides = ({ lineGroupByMainId }) => lineGroupByMainId,
    buildTransferLineStationNameMap = async () => new Map()
} = {}) => {
    const mergedDisplayInfo = buildPanelLineMergeInfo({
        servingLineIds: displayServingIds,
        getLineMeta
    });
    const nextDisplayServingIds = Array.isArray(mergedDisplayInfo?.displayLineIds)
        ? mergedDisplayInfo.displayLineIds
        : displayServingIds;

    const lineGroupByMainId = applyTemporarySourceLineOverrides({
        lineGroupByMainId: mergedDisplayInfo?.lineGroupByMainId instanceof Map
            ? mergedDisplayInfo.lineGroupByMainId
            : new Map(),
        temporarySourceLineIdsByDisplayLineId
    });

    const lineStationNameByLineId = await buildTransferLineStationNameMap({
        stationId,
        stationNameZh,
        servingLineIds: nextDisplayServingIds,
        lineGroupByMainId
    });

    return {
        displayServingIds: nextDisplayServingIds,
        lineGroupByMainId,
        lineStationNameByLineId
    };
};

// panelThroughServiceDisplayOrder.js
const toText_panelThroughServiceDisplayOrder = (value) => String(value ?? '').trim();

const normalizeTextList_panelThroughServiceDisplayOrder = (value, {
    toText = toText_panelThroughServiceDisplayOrder
} = {}) => {
    const source = (() => {
        if (Array.isArray(value)) return value;
        if (value instanceof Set) return Array.from(value);
        if (value && typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') {
            return Array.from(value);
        }
        return value ? [value] : [];
    })();
    return Array.from(new Set(source.map((item) => toText(item)).filter(Boolean)));
};

const getPanelThroughConfigSegmentLineIds = (config, {
    toText = toText_panelThroughServiceDisplayOrder
} = {}) => {
    const derivedIds = normalizeTextList_panelThroughServiceDisplayOrder(config?.segmentLineIds, { toText });
    if (derivedIds.length) return derivedIds;
    return normalizeTextList_panelThroughServiceDisplayOrder(
        (Array.isArray(config?.segments) ? config.segments : []).map((segment) => segment?.lineId),
        { toText }
    );
};

const isPanelLineElement = (value) => (
    !!value?.classList?.contains?.('panel-line')
    && typeof value?.getAttribute === 'function'
);

const addPanelThroughOrderGroupEntry = (groups, entry) => {
    const overlaps = groups.filter((group) => (
        entry.sourceIds.some((sourceId) => group.sourceIdSet.has(sourceId))
    ));

    if (!overlaps.length) {
        groups.push({
            sourceIdSet: new Set(entry.sourceIds),
            throughEntries: [entry]
        });
        return;
    }

    const target = overlaps[0];
    for (const sourceId of entry.sourceIds) target.sourceIdSet.add(sourceId);
    target.throughEntries.push(entry);

    for (const group of overlaps.slice(1)) {
        for (const sourceId of group.sourceIdSet) target.sourceIdSet.add(sourceId);
        target.throughEntries.push(...group.throughEntries);
        const idx = groups.indexOf(group);
        if (idx >= 0) groups.splice(idx, 1);
    }
};

export const reorderPanelThroughServiceLinesAfterHtml = (root, {
    temporarySourceLineIdsByDisplayLineId,
    throughServiceConfigs = [],
    toText = toText_panelThroughServiceDisplayOrder
} = {}) => {
    const companyLineContainers = Array.from(root?.querySelectorAll?.('.panel-company-lines') || []);
    if (!companyLineContainers.length) return;

    const configs = Array.isArray(throughServiceConfigs) ? throughServiceConfigs : [];
    if (!configs.length) return;

    for (const companyLinesEl of companyLineContainers) {
        const lineEls = Array.from(companyLinesEl.children || []).filter(isPanelLineElement);
        if (lineEls.length < 2) continue;

        const lineElById = new Map();
        const lineIndexById = new Map();
        lineEls.forEach((lineEl, index) => {
            const lineId = toText(lineEl.getAttribute('data-line-id'));
            if (!lineId || lineElById.has(lineId)) return;
            lineElById.set(lineId, lineEl);
            lineIndexById.set(lineId, index);
        });
        if (!lineElById.size) continue;

        const groups = [];
        configs.forEach((config, configIndex) => {
            const throughLineId = toText(config?.lineId);
            if (!throughLineId || !lineElById.has(throughLineId)) return;

            const runtimeSourceIds = normalizeTextList_panelThroughServiceDisplayOrder(
                temporarySourceLineIdsByDisplayLineId instanceof Map
                    ? temporarySourceLineIdsByDisplayLineId.get(throughLineId)
                    : [],
                { toText }
            ).filter((lineId) => lineId !== throughLineId && lineElById.has(lineId));

            const sourceIds = runtimeSourceIds.length
                ? runtimeSourceIds
                : getPanelThroughConfigSegmentLineIds(config, { toText })
                    .filter((lineId) => lineId !== throughLineId && lineElById.has(lineId));

            if (!sourceIds.length) return;
            addPanelThroughOrderGroupEntry(groups, {
                throughLineId,
                configIndex,
                sourceIds
            });
        });

        if (!groups.length) continue;

        const blockByAnchorLineId = new Map();
        const managedLineIds = new Set();
        for (const group of groups) {
            const orderedSourceIds = Array.from(group.sourceIdSet)
                .filter((lineId) => lineElById.has(lineId))
                .sort((left, right) => lineIndexById.get(left) - lineIndexById.get(right));
            if (!orderedSourceIds.length) continue;

            const orderedThroughIds = Array.from(new Map(
                group.throughEntries
                    .filter((entry) => lineElById.has(entry.throughLineId))
                    .sort((left, right) => left.configIndex - right.configIndex)
                    .map((entry) => [entry.throughLineId, entry.throughLineId])
            ).values());
            if (!orderedThroughIds.length) continue;

            const blockIds = [...orderedSourceIds, ...orderedThroughIds];
            for (const lineId of blockIds) managedLineIds.add(lineId);
            blockByAnchorLineId.set(orderedSourceIds[0], blockIds);
        }

        if (!blockByAnchorLineId.size) continue;

        const nextLineEls = [];
        const appendedGroups = new Set();
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute('data-line-id'));
            const blockIds = blockByAnchorLineId.get(lineId);
            if (blockIds && !appendedGroups.has(lineId)) {
                for (const blockLineId of blockIds) {
                    const blockLineEl = lineElById.get(blockLineId);
                    if (blockLineEl) nextLineEls.push(blockLineEl);
                }
                appendedGroups.add(lineId);
                continue;
            }
            if (managedLineIds.has(lineId)) continue;
            nextLineEls.push(lineEl);
        }

        nextLineEls.forEach((lineEl) => companyLinesEl.appendChild(lineEl));
    }
};

// panelThroughServiceSetup.js
const toText_panelThroughServiceSetup = (value) => String(value ?? '').trim();

const createEmptyState_panelThroughServiceSetup = () => ({
    temporaryLineMetaById: new Map(),
    temporarySourceLineIdsByDisplayLineId: new Map(),
    temporaryAllowedTripKeysByDisplayLineId: new Map(),
    throughServiceDirectionsByEntityLineId: new Map()
});

export const createEmptyPanelThroughServiceState = () => createEmptyState_panelThroughServiceSetup();

const normalizeTextList_panelThroughServiceSetup = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
        .map((value) => toText_panelThroughServiceSetup(value))
        .filter(Boolean)
));

const cloneTripKeySet_panelThroughServiceSetup = (values) => (
    values instanceof Set
        ? new Set(Array.from(values).map((value) => toText_panelThroughServiceSetup(value)).filter(Boolean))
        : new Set(normalizeTextList_panelThroughServiceSetup(values))
);

const appendThroughServiceDirectionEntry = (target, entityLineId, entry) => {
    const lineId = toText_panelThroughServiceSetup(entityLineId);
    if (!lineId) return;
    const current = Array.isArray(target.get(lineId)) ? target.get(lineId) : [];
    if (!current.some((item) => (
        item?.throughLineId === entry.throughLineId &&
        item?.category === entry.category
    ))) {
        current.push(entry);
    }
    target.set(lineId, current);
};

export const resolvePanelThroughServiceSetup = ({
    throughPlan = null,
    displayServingIds = [],
    throughServiceConfigs = []
} = {}) => {
    const state = createEmptyState_panelThroughServiceSetup();
    const configByLineId = new Map(
        (Array.isArray(throughServiceConfigs) ? throughServiceConfigs : [])
            .map((config) => [toText_panelThroughServiceSetup(config?.lineId), config])
            .filter(([lineId]) => lineId)
    );
    const throughLineIds = new Set(configByLineId.keys());
    const nextDisplayServingIds = normalizeTextList_panelThroughServiceSetup(displayServingIds)
        .filter((lineId) => !throughLineIds.has(lineId));

    if (!throughPlan) {
        return {
            ...state,
            displayServingIds: nextDisplayServingIds
        };
    }

    if (throughPlan.temporaryLineMetaById instanceof Map) {
        state.temporaryLineMetaById = throughPlan.temporaryLineMetaById;
    }
    if (throughPlan.temporarySourceLineIdsByDisplayLineId instanceof Map) {
        state.temporarySourceLineIdsByDisplayLineId = throughPlan.temporarySourceLineIdsByDisplayLineId;
    }
    if (throughPlan.temporaryAllowedTripKeysByDisplayLineId instanceof Map) {
        state.temporaryAllowedTripKeysByDisplayLineId = throughPlan.temporaryAllowedTripKeysByDisplayLineId;
    }

    const sourceLineIdsByThroughLineId = state.temporarySourceLineIdsByDisplayLineId instanceof Map
        ? state.temporarySourceLineIdsByDisplayLineId
        : new Map();
    const allowedTripKeysByThroughLineId = state.temporaryAllowedTripKeysByDisplayLineId instanceof Map
        ? state.temporaryAllowedTripKeysByDisplayLineId
        : new Map();
    const servingLineIdSet = new Set(nextDisplayServingIds);

    for (const [throughLineIdRaw, sourceLineIdsRaw] of sourceLineIdsByThroughLineId.entries()) {
        const throughLineId = toText_panelThroughServiceSetup(throughLineIdRaw);
        if (!throughLineId) continue;
        const config = configByLineId.get(throughLineId) || null;
        const sourceLineIds = normalizeTextList_panelThroughServiceSetup(sourceLineIdsRaw);
        if (!sourceLineIds.length) continue;
        const visibleEntityLineIds = sourceLineIds
            .filter((lineId) => servingLineIdSet.has(lineId));
        if (!visibleEntityLineIds.length) continue;

        const allowedTripKeys = cloneTripKeySet_panelThroughServiceSetup(
            allowedTripKeysByThroughLineId.get(throughLineId)
        );
        if (!allowedTripKeys.size) continue;

        const entry = {
            category: toText_panelThroughServiceSetup(config?.category),
            throughLineId,
            sourceLineIds,
            allowedTripKeys,
            lineName: toText_panelThroughServiceSetup(config?.lineName),
            color: toText_panelThroughServiceSetup(config?.color)
        };
        for (const sourceLineId of visibleEntityLineIds) {
            appendThroughServiceDirectionEntry(
                state.throughServiceDirectionsByEntityLineId,
                sourceLineId,
                entry
            );
        }
    }

    return {
        ...state,
        displayServingIds: nextDisplayServingIds
    };
};

// panelStationThroughPreviewRequests.js
const normalizeList_panelStationThroughPreview = (values, {
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    const raw = values instanceof Set
        ? Array.from(values)
        : (Array.isArray(values) ? values : (values ? [values] : []));
    return Array.from(new Set(raw.map((value) => normalize(value)).filter(Boolean)));
};

const buildThroughServiceConfigIndexes_panelStationThroughPreview = ({
    throughServiceConfigs = [],
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    const byLineId = new Map();
    const byCategory = new Map();
    for (const config of Array.isArray(throughServiceConfigs) ? throughServiceConfigs : []) {
        const lineId = normalize(config?.lineId);
        const category = normalize(config?.category);
        if (lineId) byLineId.set(lineId, config);
        if (category) byCategory.set(category, config);
    }
    return { byLineId, byCategory };
};

const resolveThroughPreviewLineId_panelStationThroughPreview = ({
    meta = null,
    displayLineId = '',
    throughServiceConfigs = [],
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    const explicitThroughLineId = normalize(meta?.throughLineId);
    if (explicitThroughLineId) return explicitThroughLineId;

    const category = normalize(meta?.throughServiceCategory);
    if (!category) return '';

    const { byCategory } = buildThroughServiceConfigIndexes_panelStationThroughPreview({
        throughServiceConfigs,
        normalize
    });
    const configLineId = normalize(byCategory.get(category)?.lineId);
    return configLineId;
};

const collectMappedValuesForLineIds_panelStationThroughPreview = ({
    sourceMap,
    lineIds,
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    if (!(sourceMap instanceof Map)) return [];
    const out = [];
    for (const lineId of normalizeList_panelStationThroughPreview(lineIds, { normalize })) {
        out.push(...normalizeList_panelStationThroughPreview(sourceMap.get(lineId), { normalize }));
    }
    return Array.from(new Set(out));
};

export const buildPanelStationThroughPreviewFilterValues = ({
    lineDirKey = '',
    meta = null,
    dirFilteredTripKeysByKey,
    temporarySourceLineIdsByDisplayLineId,
    temporaryAllowedTripKeysByDisplayLineId,
    throughServiceConfigs = [],
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    const displayLineId = normalize(meta?.lineId);
    const normalizedLineDirKey = normalize(lineDirKey);
    const throughLineId = resolveThroughPreviewLineId_panelStationThroughPreview({
        meta,
        displayLineId,
        throughServiceConfigs,
        normalize
    });
    const lookupLineIds = normalizeList_panelStationThroughPreview(
        [throughLineId, displayLineId],
        { normalize }
    );

    const directionTripKeys = dirFilteredTripKeysByKey instanceof Map
        ? normalizeList_panelStationThroughPreview(dirFilteredTripKeysByKey.get(normalizedLineDirKey), { normalize })
        : [];
    const temporaryTripKeys = collectMappedValuesForLineIds_panelStationThroughPreview({
        sourceMap: temporaryAllowedTripKeysByDisplayLineId,
        lineIds: lookupLineIds,
        normalize
    });
    const temporarySourceLineIds = collectMappedValuesForLineIds_panelStationThroughPreview({
        sourceMap: temporarySourceLineIdsByDisplayLineId,
        lineIds: lookupLineIds,
        normalize
    });
    const metaSourceLineIds = normalizeList_panelStationThroughPreview(meta?.sourceLineIds, { normalize });

    return {
        throughLineId,
        sourceLineIds: Array.from(new Set([
            ...temporarySourceLineIds,
            ...metaSourceLineIds
        ])),
        targetTripKeys: Array.from(new Set([
            ...directionTripKeys,
            ...temporaryTripKeys
        ]))
    };
};

export const buildPanelStationThroughPreviewRequests = ({
    dirPreviewMetaByKey,
    dirFilteredTripKeysByKey,
    temporarySourceLineIdsByDisplayLineId,
    temporaryAllowedTripKeysByDisplayLineId,
    throughServiceConfigs = [],
    getLineMeta = () => null,
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    if (!(dirPreviewMetaByKey instanceof Map) || !dirPreviewMetaByKey.size) return [];

    const { byLineId, byCategory } = buildThroughServiceConfigIndexes_panelStationThroughPreview({
        throughServiceConfigs,
        normalize
    });
    const out = [];
    const seenRequestKeys = new Set();

    for (const [lineDirKeyRaw, meta] of dirPreviewMetaByKey.entries()) {
        const lineDirKey = normalize(lineDirKeyRaw);
        const displayLineId = normalize(meta?.lineId);
        if (!lineDirKey || !displayLineId) continue;

        const {
            throughLineId,
            sourceLineIds,
            targetTripKeys
        } = buildPanelStationThroughPreviewFilterValues({
            lineDirKey,
            meta,
            dirFilteredTripKeysByKey,
            temporarySourceLineIdsByDisplayLineId,
            temporaryAllowedTripKeysByDisplayLineId,
            throughServiceConfigs,
            normalize
        });
        if (!targetTripKeys.length) continue;

        const throughServiceCategory = normalize(meta?.throughServiceCategory)
            || normalize(byLineId.get(throughLineId)?.category);
        const config = byLineId.get(throughLineId)
            || byLineId.get(displayLineId)
            || byCategory.get(throughServiceCategory);
        const lineMeta = getLineMeta(displayLineId) || {};
        const requestKey = [
            displayLineId,
            sourceLineIds.join('|'),
            throughServiceCategory,
            targetTripKeys.join('|')
        ].join('##');
        if (seenRequestKeys.has(requestKey)) continue;
        seenRequestKeys.add(requestKey);

        out.push({
            lineId: displayLineId,
            lineName: normalize(config?.lineName) || normalize(lineMeta?.name) || displayLineId,
            sourceLineIds,
            targetTripKeys,
            throughServiceCategory,
            highlightColor: normalize(config?.color) || normalize(lineMeta?.color),
            originStationIds: normalizeList_panelStationThroughPreview(meta?.originStationIds, { normalize }),
            terminalStationIds: normalizeList_panelStationThroughPreview(meta?.terminalStationIds, { normalize }),
            endpointLabelCounts: Array.isArray(meta?.endpointLabelCounts) ? meta.endpointLabelCounts : []
        });
    }

    return out;
};

export const applyTemporarySourceLineOverrides = ({
    lineGroupByMainId,
    temporarySourceLineIdsByDisplayLineId,
    normalize = toText_panelThroughServiceSetup
} = {}) => {
    const nextLineGroupByMainId = lineGroupByMainId instanceof Map
        ? new Map(lineGroupByMainId)
        : new Map();

    if (!(temporarySourceLineIdsByDisplayLineId instanceof Map) || !temporarySourceLineIdsByDisplayLineId.size) {
        return nextLineGroupByMainId;
    }

    for (const [displayLineId, sourceLineIds] of temporarySourceLineIdsByDisplayLineId.entries()) {
        const normalizedDisplayLineId = normalize(displayLineId);
        if (!normalizedDisplayLineId) continue;

        const normalizedSourceLineIds = Array.isArray(sourceLineIds)
            ? Array.from(new Set(sourceLineIds.map((value) => normalize(value)).filter(Boolean)))
            : [];
        if (!normalizedSourceLineIds.length) continue;

        nextLineGroupByMainId.set(normalizedDisplayLineId, normalizedSourceLineIds);
    }

    return nextLineGroupByMainId;
};

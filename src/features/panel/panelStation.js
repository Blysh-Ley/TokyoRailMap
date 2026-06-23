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
    clearHoverTimer = () => {},
    clearRestoreTimer = () => {},
    clearTripHighlightTimer = () => {},
    hideTripDetail = () => {},
    closeDirFilterPopover = () => {},
    clearPinnedPanelState = () => {}
} = {}) => {
    dirPrintPayloadByKey?.clear?.();
    dirFilterStateByKey?.clear?.();
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

// panelThroughServiceSetup.js
const toText_panelThroughServiceSetup = (value) => String(value ?? '').trim();

const createEmptyState_panelThroughServiceSetup = () => ({
    temporaryLineMetaById: new Map(),
    temporarySourceLineIdsByDisplayLineId: new Map(),
    temporaryAllowedTripKeysByDisplayLineId: new Map()
});

export const createEmptyPanelThroughServiceState = () => createEmptyState_panelThroughServiceSetup();

export const resolvePanelThroughServiceSetup = ({
    throughPlan = null,
    displayServingIds = []
} = {}) => {
    const state = createEmptyState_panelThroughServiceSetup();
    const nextDisplayServingIds = Array.isArray(displayServingIds) ? displayServingIds : [];

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

    return {
        ...state,
        displayServingIds: Array.isArray(throughPlan.displayServingIds)
            ? throughPlan.displayServingIds
            : nextDisplayServingIds
    };
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

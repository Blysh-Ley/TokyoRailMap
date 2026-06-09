import { getCachedJson } from '../../lib/fetch.js';
import { resolveMainLineIdForIcon } from '../../lib/line-icons.js';

const defaultToText = (value) => String(value ?? '').trim();

export const readStationName = (props, {
    toText = defaultToText
} = {}) => {
    const value = props || {};
    return toText(value.name_zh || value['name:zh'] || value.name || value.name_ja || value['name:ja'] || '');
};

export const pickTitleZhHans = (titleObj, {
    toText = defaultToText
} = {}) => toText(titleObj?.zhHans || titleObj?.zhHant || titleObj?.zh || titleObj?.ja || titleObj?.en || '');

export const pickTitleEn = (titleObj, {
    toText = defaultToText
} = {}) => toText(titleObj?.en || titleObj?.['en-US'] || titleObj?.ja || '');

let stationsIndexPromise = null;
let stationGroupsIndexPromise = null;
let trainTypesIndexPromise = null;
let trainTypeColorIndexPromise = null;

export const resetPanelStationMetadataCachesForTest = () => {
    stationsIndexPromise = null;
    stationGroupsIndexPromise = null;
    trainTypesIndexPromise = null;
    trainTypeColorIndexPromise = null;
};

export const getStationsIndex = async ({
    toText = defaultToText,
    loadJson = getCachedJson
} = {}) => {
    if (stationsIndexPromise) return stationsIndexPromise;
    stationsIndexPromise = (async () => {
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
                const code = toText(station?.code);
                idToNameZh.set(id, name);
                if (nameEn) idToNameEn.set(id, nameEn);
                if (code) idToCode.set(id, code);
                const railway = toText(station?.r);
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
    return stationsIndexPromise;
};

export const getStationGroupsIndex = async ({
    toText = defaultToText,
    loadJson = getCachedJson
} = {}) => {
    if (stationGroupsIndexPromise) return stationGroupsIndexPromise;
    stationGroupsIndexPromise = (async () => {
        try {
            const list = await loadJson('./data/station-groups.json');
            const map = new Map();
            for (const group of Array.isArray(list) ? list : []) {
                const ids = Array.isArray(group?.ids) ? group.ids.map((value) => toText(value)).filter(Boolean) : [];
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
    return stationGroupsIndexPromise;
};

export const getTrainTypesIndex = async ({
    toText = defaultToText,
    loadJson = getCachedJson
} = {}) => {
    if (trainTypesIndexPromise) return trainTypesIndexPromise;
    trainTypesIndexPromise = (async () => {
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
    return trainTypesIndexPromise;
};

export const getTrainTypeColorIndex = async ({
    toText = defaultToText,
    loadJson = getCachedJson
} = {}) => {
    if (trainTypeColorIndexPromise) return trainTypeColorIndexPromise;
    trainTypeColorIndexPromise = (async () => {
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
    return trainTypeColorIndexPromise;
};

export const buildTransferLineStationNameMap = async ({
    stationId,
    stationNameZh,
    servingLineIds,
    lineGroupByMainId,
    toText = defaultToText,
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

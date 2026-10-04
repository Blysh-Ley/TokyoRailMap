import { buildTransferBadgeEntriesByStationId, buildSupplementalTransferBadgeEntries, compactTransferBadgeEntries, sortTransferBadgeEntriesByCompany } from '../transferBadgeDisplay.js';
import { THROUGH_SERVICE_CONFIGS, buildThroughServiceDerivedState } from '../../lib/throughServiceManager.js';
import { preferredOrder, resolveMainLineIdByBranchRule } from '../../lib/special-condition.js';
import { title, unique } from './trips.js';

export const buildDiagramTransfers = async ({ stations, stationGroups, railways, topology }) => {
    const groupById = new Map();
    for (const group of stationGroups) {
        const ids = unique(group.flat());
        const raw = new Set(ids);
        const visible = ids.filter((id) => !raw.has(topology.stationById.get(id)?.alternate));
        const members = new Set(visible.length ? visible : ids);
        for (const id of ids) groupById.set(id, members);
    }
    const getGroup = (id) => groupById.get(id) || new Set([id]);
    const badges = await buildTransferBadgeEntriesByStationId({
        stationIds: stations.map((station) => station.id), dedupeDisplayNames: true,
        getGroupIdsForStation: getGroup, preferredCompanyOrder: preferredOrder,
        getLineMeta: (id) => {
            const line = topology.lineById.get(id);
            return { company: id.split('.')[0], color: line?.color, name: title(line?.title).replace(/（.*?）|\(.*?\)/g, '') || id };
        },
        getStationCode: (id) => topology.stationById.get(id)?.title?.code || '',
        resolveIconMeta: (id) => {
            const mainId = resolveMainLineIdByBranchRule(id, (candidate) => topology.lineById.has(candidate));
            const line = topology.lineById.get(mainId);
            return line ? { id: mainId, code: line.code, color: line.color } : null;
        }
    });
    // 从输入数据派生补充换乘，不读取应用初始化后的全局直通状态。
    const derived = buildThroughServiceDerivedState({ railways });
    const configs = Object.fromEntries(THROUGH_SERVICE_CONFIGS.map((info) => [info.category, {
        operator: info.operator, lineId: info.lineId, lineName: info.lineName, color: info.color,
        ...derived.infoByCategory[info.category]
    }]));
    return stations.map((station) => {
        const ordinary = badges.get(station.id)?.entries || [];
        const supplemental = buildSupplementalTransferBadgeEntries({
            serviceConfigsByKey: configs,
            existingDisplayStationIds: ordinary.flatMap((entry) => entry.displayStationIds),
            stationRefs: [
                ...station.aliases.map((id) => ({ stationId: id, displayStationIds: [...getGroup(id)] })),
                ...ordinary.map((entry) => ({ stationId: entry.stationId, displayStationIds: entry.displayStationIds }))
            ]
        });
        const names = new Set(ordinary.map((entry) => entry.displayName));
        const entries = [...ordinary];
        for (const entry of supplemental) if (!names.has(entry.displayName)) {
            names.add(entry.displayName);
            entries.push(entry);
        }
        return { ...station, transfers: compactTransferBadgeEntries(sortTransferBadgeEntriesByCompany(entries, { preferredCompanyOrder: preferredOrder })) };
    });
};

import { buildTransferBadgeEntriesByStationId, compactTransferBadgeEntries, sortTransferBadgeEntriesByCompany } from '../transferBadgeDisplay.js';
import { preferredOrder, resolveMainLineIdByBranchRule } from '../../lib/special-condition.js';
import { lineIdOf, title, unique } from './trips.js';

export const buildDiagramTransfers = async ({ stations, stationGroups, topology }) => {
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
        stationIds: stations.map((station) => station.displayStationId), dedupeDisplayNames: true,
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
    return stations.map((station) => {
        const company = lineIdOf(station.displayStationId).split('.')[0];
        const entries = (badges.get(station.displayStationId)?.entries || [])
            .filter((entry) => !(entry.company === company && station.code && entry.stationCode === station.code));
        return {
            ...station,
            transfers: compactTransferBadgeEntries(sortTransferBadgeEntriesByCompany(entries, { preferredCompanyOrder: preferredOrder }))
        };
    });
};

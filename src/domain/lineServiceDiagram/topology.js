import { buildAlternateLineMembership, filterLineStationIdsForAlternateMembership } from '../alternateLineMembership.js';
import { consecutive, lineIdOf, stopIds, text, title, unique } from './trips.js';

const contains = (part, whole) => whole.some((_, index) => part.every((id, offset) => whole[index + offset] === id));
export const edgeKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
export const containsPath = (part, whole) => contains(part, whole) || contains(part.slice().reverse(), whole);

export const buildStationTopology = ({ lineId, railways, stations, stationGroups, runs }) => {
    const lineById = new Map(railways.map((line) => [line.id, line]));
    const stationById = new Map(stations.map((station) => [station.id, station]));
    const selectedLine = lineById.get(lineId);
    if (!selectedLine) throw new Error(`找不到线路：${lineId}`);
    const parent = new Map();
    const find = (id) => {
        if (!parent.has(id)) parent.set(id, id);
        if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
        return parent.get(id);
    };
    const join = (a, b) => { if (a && b) parent.set(find(b), find(a)); };
    for (const station of stations) {
        find(station.id);
        if (station.alternate) join(station.id, station.alternate);
    }
    // 站组外层是换乘，只有内层同站关系用于连接线路。
    for (const group of stationGroups) for (const platform of group) {
        for (const id of platform.slice(1)) join(platform[0], id);
    }
    for (const { chain } of runs) for (let i = 1; i < chain.length; i += 1) {
        const a = stopIds(chain[i - 1]).at(-1), b = stopIds(chain[i])[0];
        if (a && b && a.split('.').at(-1) === b.split('.').at(-1)) join(a, b);
    }
    const membership = buildAlternateLineMembership({ railways, stations });
    const visible = filterLineStationIdsForAlternateMembership(lineId, selectedLine.stations, membership);
    const preferred = new Set(visible);
    const rank = (id) => [preferred.has(id) ? 0 : 1, stationById.get(id)?.alternate ? 1 : 0, -(lineById.get(lineIdOf(id))?.stations?.length || 0)];
    const compare = (a, b) => {
        const ar = rank(a), br = rank(b);
        return ar[0] - br[0] || ar[1] - br[1] || ar[2] - br[2] || a.localeCompare(b);
    };
    const groups = new Map();
    for (const id of parent.keys()) {
        const key = find(id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(id);
    }
    const aliases = new Map(), canonical = new Map();
    for (const ids of groups.values()) {
        ids.sort(compare);
        aliases.set(ids[0], ids);
        for (const id of ids) canonical.set(id, ids[0]);
    }
    const positionsByStation = new Map();
    for (const id of visible) {
        const physicalId = canonical.get(id) || id;
        if (!positionsByStation.has(physicalId)) positionsByStation.set(physicalId, new Set());
        positionsByStation.get(physicalId).add(id);
    }
    // Railway 已用独立记录表达同站的不同站序位置；绘图保留这些记录，同站别名仍用于物理连接。
    const repeatedPositions = new Set([...positionsByStation.values()].filter((ids) => ids.size > 1).flatMap((ids) => [...ids]));
    const canon = (id) => repeatedPositions.has(id) ? id : canonical.get(id) || id;
    const orders = new Map();
    const getOrder = (id) => {
        if (orders.has(id)) return orders.get(id);
        // 同站关系用于连接站点，经过区段只取班次所属线路的站序，不从其他线路补站。
        const order = consecutive((lineById.get(id)?.stations || []).map(canon));
        if (!order.length) throw new Error(`缺少线路站序：${id}`);
        orders.set(id, order);
        return orders.get(id);
    };
    const servedStations = new Set([...visible.map(canon), ...runs.flatMap(({ chain }) => chain.flatMap((trip) => stopIds(trip).map(canon)))]);
    const segmentByTrip = new Map();
    const segment = (trip) => {
        if (segmentByTrip.has(trip)) return segmentByTrip.get(trip);
        const id = trip.r || lineIdOf(trip.id), railway = lineById.get(id);
        getOrder(id);
        // 区段只保留本线站点和实际停站，不补入纯经过站。
        const order = railway.stations.filter((sid) => servedStations.has(canon(sid))), stops = consecutive(stopIds(trip));
        const circular = order.length > 2 && order[0] === order.at(-1);
        const sequence = circular ? order.slice(0, -1) : order;
        const indices = stops.map((sid) => sequence.indexOf(sid));
        if (indices.some((index) => index < 0)) throw new Error(`班次停站不在线路站序中：${trip.id}`);
        const path = stops.length ? [stops[0]] : [];
        const step = circular ? (trip.d === railway.ascending ? 1 : trip.d === railway.descending ? -1 : 0) : 0;
        if (circular && !step && stops.length > 1) throw new Error(`无法确定环线班次方向：${trip.id}`);
        for (let i = 1; i < stops.length; i += 1) {
            const start = indices[i - 1], end = indices[i];
            if (circular) {
                let at = start;
                do {
                    at = (at + step + sequence.length) % sequence.length;
                    path.push(sequence[at]);
                } while (at !== end);
            } else {
                const span = start <= end ? sequence.slice(start, end + 1) : sequence.slice(end, start + 1).reverse();
                path.push(...span.slice(1));
            }
        }
        const result = {
            lineId: id, typeId: text(trip.y), direction: text(trip.d),
            path: consecutive(path.map(canon)), stops: consecutive(stops.map(canon))
        };
        segmentByTrip.set(trip, result);
        return result;
    };
    const displayOrder = visible.map(canon);
    const station = (id, displayLineIds) => {
        const ids = aliases.get(canonical.get(id) || id) || [id];
        // 同站别名保留物理关系；独立站序位置各取自己的记录，其余节点取本线或邻近区段。
        const displayStationId = (repeatedPositions.has(id) ? id : ids.find((alias) => preferred.has(alias)))
            || displayLineIds.map((lineId) => ids.find((alias) => lineIdOf(alias) === lineId)).find(Boolean) || id;
        const source = stationById.get(displayStationId);
        // 直通交界取实际经过的线路；南北线和三田线的同站别名还表达目黑至白金高轮的共线区段。
        const servingLines = new Set(displayLineIds);
        if (servingLines.has('TokyoMetro.Namboku') || servingLines.has('Toei.Mita')) {
            servingLines.add('TokyoMetro.Namboku');
            servingLines.add('Toei.Mita');
        }
        const seenBadges = new Set();
        const stationBadges = unique([displayStationId, ...ids.filter((alias) => servingLines.has(lineIdOf(alias)))])
            .flatMap((stationId) => {
                const lineId = lineIdOf(stationId), line = lineById.get(lineId);
                const code = text(stationById.get(stationId)?.title?.code), color = text(line?.color);
                const key = JSON.stringify([lineId.split('.')[0], code, color]);
                if (!code || seenBadges.has(key)) return [];
                seenBadges.add(key);
                return [{ stationId, lineId, code, color }];
            });
        return {
            id, displayStationId, name: title(source?.title) || id,
            code: text(source?.title?.code), stationBadges, aliases: ids, lineIds: unique(ids.map(lineIdOf))
        };
    };
    return { selectedLineId: lineId, canon, segment, station, getOrder, orders, lineById, stationById, displayOrder: unique(displayOrder) };
};

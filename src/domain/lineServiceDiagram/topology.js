import { buildAlternateLineMembership, filterLineStationIdsForAlternateMembership } from '../alternateLineMembership.js';
import { consecutive, lineIdOf, stopIds, text, title, unique } from './trips.js';

const contains = (part, whole) => whole.some((_, index) => part.every((id, offset) => whole[index + offset] === id));
const isSubsequence = (part, whole) => {
    let index = 0;
    for (const id of whole) if (id === part[index]) index += 1;
    return index === part.length;
};
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
    const canon = (id) => canonical.get(id) || id;
    const rawOrders = new Map(railways.map((line) => [line.id, consecutive((line.stations || []).map(canon))]));
    const orders = new Map();
    const getOrder = (id) => {
        if (orders.has(id)) return orders.get(id);
        const raw = rawOrders.get(id);
        if (!raw?.length) throw new Error(`缺少线路站序：${id}`);
        const ownStations = new Set(raw);
        const result = [raw[0]];
        for (let i = 1; i < raw.length; i += 1) {
            const a = raw[i - 1], b = raw[i];
            const spans = [[a, b]];
            for (const [sourceId, source] of rawOrders) {
                if (sourceId === id || source[0] === source.at(-1)) continue;
                const start = source.indexOf(a), end = source.indexOf(b);
                if (start < 0 || end < 0 || Math.abs(start - end) < 2) continue;
                const span = start < end ? source.slice(start, end + 1) : source.slice(end, start + 1).reverse();
                if (span.slice(1, -1).some((sid) => ownStations.has(sid))) continue;
                spans.push(span);
            }
            spans.sort((aSpan, bSpan) => bSpan.length - aSpan.length);
            // 只展开已有站序一致指向的共用区间，不依据换乘关系猜测绕行。
            const span = spans.every((candidate) => isSubsequence(candidate, spans[0])) ? spans[0] : [a, b];
            result.push(...span.slice(1));
        }
        orders.set(id, consecutive(result));
        return orders.get(id);
    };
    const segmentByTrip = new Map();
    const segment = (trip) => {
        if (segmentByTrip.has(trip)) return segmentByTrip.get(trip);
        const id = trip.r || lineIdOf(trip.id), order = getOrder(id);
        const stops = consecutive(stopIds(trip).map(canon));
        const circular = order.length > 2 && order[0] === order.at(-1);
        const sequence = circular ? order.slice(0, -1) : order;
        const indices = stops.map((sid) => sequence.indexOf(sid));
        if (indices.some((index) => index < 0)) throw new Error(`班次停站不在线路站序中：${trip.id}`);
        const path = stops.length ? [stops[0]] : [];
        const railway = lineById.get(id);
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
        const result = { lineId: id, typeId: text(trip.y), direction: text(trip.d), path, stops };
        segmentByTrip.set(trip, result);
        return result;
    };
    const codes = visible.map((id) => text(stationById.get(id)?.title?.code).match(/^([A-Za-z]+)(\d+)$/));
    const displayOrder = codes.every(Boolean) && new Set(codes.map((code) => code[1])).size === 1
        ? visible.map((id, index) => ({ id, number: Number(codes[index][2]) })).sort((a, b) => a.number - b.number).map(({ id }) => canon(id))
        : visible.map(canon);
    const station = (id) => ({
        id, name: title(stationById.get(id)?.title) || id,
        code: text(stationById.get(id)?.title?.code), aliases: aliases.get(id) || [id],
        lineIds: unique((aliases.get(id) || [id]).map(lineIdOf))
    });
    return { selectedLineId: lineId, canon, segment, station, getOrder, orders, lineById, stationById, displayOrder: unique(displayOrder) };
};

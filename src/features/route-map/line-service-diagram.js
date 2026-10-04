import { DATA_URLS, getCachedJson } from '../../lib/fetch.js';
import { getGlobalTimetableCache } from '../../lib/timetableCache.js';
import { buildLineServiceDiagramData } from '../../domain/lineServiceDiagram.js';
import { lineIdOf, selectDiagramTrips, tripId, tripRefs, unique } from '../../domain/lineServiceDiagram/trips.js';

// 加载入口只协调现有缓存，拓扑和交路处理留在纯数据层。
export const computeLineServiceDiagramData = async (lineId) => {
    const [railways, stations, stationGroups, trainTypes, railDirections] = await Promise.all([
        getCachedJson(DATA_URLS.railways), getCachedJson(DATA_URLS.stations),
        getCachedJson(DATA_URLS.stationGroups), getCachedJson(DATA_URLS.trainTypes),
        getCachedJson(DATA_URLS.railDirections)
    ]);
    const cache = getGlobalTimetableCache();
    const lineTrips = new Map(), tripsById = new Map();
    const load = async (id) => {
        if (lineTrips.has(id)) return;
        const data = await cache.loadByLineId(id);
        if (!Array.isArray(data)) throw new Error(`无法加载线路班次：${id}`);
        lineTrips.set(id, data);
        for (const trip of data) tripsById.set(tripId(trip), trip);
    };
    await load(lineId);
    const rootTrips = lineTrips.get(lineId);
    let pending = selectDiagramTrips(rootTrips).map(tripId);
    const visited = new Set();
    while (pending.length) {
        const next = [];
        for (const id of pending) {
            if (visited.has(id)) continue;
            visited.add(id);
            const trip = tripsById.get(id);
            if (!trip) throw new Error(`缺少直通班次：${id}`);
            next.push(...tripRefs(trip, 'pt'), ...tripRefs(trip, 'nt'));
        }
        pending = unique(next).filter((id) => !visited.has(id));
        await Promise.all(unique(pending.map(lineIdOf)).map(load));
    }
    return buildLineServiceDiagramData({
        lineId, rootTrips, trips: [...tripsById.values()], railways, stations, stationGroups, trainTypes, railDirections
    });
};

import { addCount, consecutive, emptyCounts, serviceDay, stopIds, totalCounts, tripId, unique } from './trips.js';
import { containsPath, edgeKey } from './topology.js';

// 工作日与节假日合计不足五班的交路不增加图形结构；种别停站不按此阈值删除。
const MIN_ROUTE_TRIPS = 5;
const pathKey = (path) => {
    const forward = JSON.stringify(path), reverse = JSON.stringify(path.slice().reverse());
    return forward < reverse ? forward : reverse;
};
const addRoot = (entry, root) => {
    const id = tripId(root);
    if (entry.rootIds.has(id)) return;
    entry.rootIds.add(id);
    addCount(entry.counts, serviceDay(root));
};

// 删除区间时按真实边切段，不能删除中间站后把两端重新相连。
export const projectPaths = (path, edges, stationIds) => {
    const paths = [];
    let current = [];
    for (let i = 0; i < path.length; i += 1) {
        const id = path[i];
        if (!stationIds.has(id)) {
            if (current.length) paths.push(current);
            current = [];
        } else if (current.length && edges.has(edgeKey(path[i - 1], id))) {
            current.push(id);
        } else {
            if (current.length) paths.push(current);
            current = [id];
        }
    }
    if (current.length) paths.push(current);
    return paths;
};

export const buildServicePatterns = (roots, runs, topology) => {
    const routesByPath = new Map();
    for (const run of runs) {
        run.segments = run.chain.map(topology.segment);
        run.path = consecutive(run.segments.flatMap((segment) => segment.path));
        const key = pathKey(run.path);
        if (!routesByPath.has(key)) routesByPath.set(key, {
            id: `route-${routesByPath.size + 1}`, path: JSON.parse(key), counts: emptyCounts(), rootIds: new Set()
        });
        addRoot(routesByPath.get(key), run.root);
    }
    const candidates = [...routesByPath.values()];
    const frequent = candidates.filter((route) => totalCounts(route.counts) >= MIN_ROUTE_TRIPS);
    const retained = frequent.filter((route) => !frequent.some((other) => (
        other.path.length > route.path.length && containsPath(route.path, other.path)
    )));
    const edges = new Map(), stationIds = new Set(topology.displayOrder);
    const addPath = (path, lineId = '') => {
        for (const id of path) stationIds.add(id);
        for (let i = 1; i < path.length; i += 1) {
            const from = path[i - 1], to = path[i];
            if (from === to) continue;
            const key = edgeKey(from, to);
            if (!edges.has(key)) edges.set(key, { id: `edge-${edges.size + 1}`, from, to, lineIds: new Set() });
            if (lineId) edges.get(key).lineIds.add(lineId);
        }
    };
    const baseOrder = topology.getOrder(topology.selectedLineId);
    const baseNodes = new Set(topology.displayOrder);
    for (let i = 1; i < baseOrder.length; i += 1) {
        if (baseNodes.has(baseOrder[i - 1]) && baseNodes.has(baseOrder[i])) addPath(baseOrder.slice(i - 1, i + 1), topology.selectedLineId);
    }
    for (const route of retained) addPath(route.path);
    const patterns = new Map();
    for (const run of runs) {
        // 本线的其他班次可能已转换种别，不能把它的停站并到当前种别。
        const serviceSegments = [], servicePaths = [];
        let currentPath = [];
        for (let index = 0; index < run.segments.length; index += 1) {
            const segment = run.segments[index];
            if (segment.lineId !== topology.selectedLineId || run.chain[index] === run.root) {
                serviceSegments.push(segment);
                currentPath.push(...segment.path);
            } else if (currentPath.length) {
                servicePaths.push(consecutive(currentPath));
                currentPath = [];
            }
            const previous = run.segments[index - 1];
            const connector = previous && edges.get(edgeKey(previous.path.at(-1), segment.path[0]));
            if (connector) {
                connector.lineIds.add(previous.lineId);
                connector.lineIds.add(segment.lineId);
            }
        }
        if (currentPath.length) servicePaths.push(consecutive(currentPath));
        const segments = serviceSegments.map((segment) => {
            const localPaths = projectPaths(segment.path, edges, stationIds);
            for (const path of localPaths) for (let i = 1; i < path.length; i += 1) {
                edges.get(edgeKey(path[i - 1], path[i])).lineIds.add(segment.lineId);
            }
            return {
                lineId: segment.lineId, typeId: segment.typeId, direction: segment.direction,
                paths: localPaths, stopStationIds: unique(segment.stops.filter((id) => stationIds.has(id)))
            };
        }).filter((segment) => segment.paths.length);
        const paths = servicePaths.flatMap((path) => projectPaths(path, edges, stationIds));
        if (!paths.length) continue;
        // 共用区段也可能跨线转换种别，本线停站只取当前原始班次。
        const rootStops = new Set(stopIds(run.root).map(topology.canon));
        const stopStationIds = unique(segments.flatMap((segment) => segment.stopStationIds))
            .filter((id) => !baseNodes.has(id) || rootStops.has(id));
        const key = JSON.stringify([run.root.y, run.root.d, paths, stopStationIds, segments]);
        if (!patterns.has(key)) patterns.set(key, {
            id: `pattern-${patterns.size + 1}`, typeId: run.root.y, direction: run.root.d,
            paths, edgeIds: unique(paths.flatMap((path) => path.slice(1).map((id, i) => edges.get(edgeKey(path[i], id)).id))),
            stopStationIds, segments, counts: emptyCounts(), rootIds: new Set()
        });
        addRoot(patterns.get(key), run.root);
    }
    const retainedRootIds = new Set(retained.flatMap((route) => [...route.rootIds]));
    const retainedRoutes = retained.map((route) => {
        const absorbed = frequent.filter((short) => short.path.length < route.path.length && containsPath(short.path, route.path));
        for (const short of absorbed) for (const id of short.rootIds) retainedRootIds.add(id);
        return {
            id: route.id, path: route.path, counts: route.counts, totalTrips: totalCounts(route.counts),
            absorbedRouteIds: absorbed.map((short) => short.id)
        };
    });
    return {
        stationIds, edges,
        routes: retainedRoutes,
        servicePatterns: [...patterns.values()].map(({ rootIds, ...pattern }) => pattern),
        processing: {
            serviceDays: unique(roots.map(serviceDay)), minRouteTrips: MIN_ROUTE_TRIPS, filterTarget: '交路结构',
            inputTrips: roots.length, retainedTrips: retainedRootIds.size,
            routeCount: candidates.length, filteredRouteCount: candidates.length - frequent.length,
            absorbedRouteCount: frequent.length - retained.length, retainedRouteCount: retained.length
        }
    };
};

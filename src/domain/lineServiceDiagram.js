import { sortTypeNamesByBaseAndStopCount } from '../lib/train-type-sort.js';
import { addCount, buildTripChains, emptyCounts, selectDiagramTrips, serviceDay, stopIds, text, title, tripId, unique } from './lineServiceDiagram/trips.js';
import { buildStationTopology, edgeKey } from './lineServiceDiagram/topology.js';
import { buildServicePatterns, projectPaths } from './lineServiceDiagram/patterns.js';
import { buildDiagramTransfers } from './lineServiceDiagram/transfers.js';
import { buildDiagramServices, diagramTypeMeta } from './lineServiceDiagram/services.js';
import { resolveMainLineIdByBranchRule } from '../lib/special-condition.js';

const buildDisplayStations = (processed, topology) => {
    const adjacent = new Map([...processed.stationIds].map((id) => [id, []]));
    for (const edge of processed.edges.values()) {
        adjacent.get(edge.from).push(edge);
        adjacent.get(edge.to).push(edge);
    }
    const distance = new Map(topology.displayOrder.map((id) => [id, 0]));
    const pending = [...topology.displayOrder];
    for (let index = 0; index < pending.length; index += 1) for (const edge of adjacent.get(pending[index])) {
        const next = edge.from === pending[index] ? edge.to : edge.from;
        if (!distance.has(next)) {
            distance.set(next, distance.get(pending[index]) + 1);
            pending.push(next);
        }
    }
    return [...processed.stationIds].map((id) => {
        const other = (edge) => edge.from === id ? edge.to : edge.from;
        const lines = adjacent.get(id).slice().sort((a, b) => distance.get(other(a)) - distance.get(other(b)))
            .flatMap((edge) => [...edge.lineIds]);
        return topology.station(id, lines);
    });
};

const buildTrainTypes = (roots, patterns, metadata) => {
    const byId = new Map(metadata.map((type) => [type.id, type]));
    const types = unique(roots.map((trip) => text(trip.y))).map((id) => {
        const trips = roots.filter((trip) => trip.y === id);
        const meta = diagramTypeMeta(id, byId);
        const counts = emptyCounts();
        for (const trip of trips) addCount(counts, serviceDay(trip));
        const directions = unique(trips.map((trip) => trip.d)).map((direction) => {
            const local = patterns.filter((pattern) => pattern.typeId === id && pattern.direction === direction);
            const directionCounts = emptyCounts();
            for (const trip of trips.filter((trip) => trip.d === direction)) addCount(directionCounts, serviceDay(trip));
            return {
                id: direction, counts: directionCounts, patternIds: local.map((pattern) => pattern.id),
                edgeIds: unique(local.flatMap((pattern) => pattern.edgeIds)),
                stationIds: unique(local.flatMap((pattern) => pattern.paths.flat())),
                stopStationIds: unique(local.flatMap((pattern) => pattern.stopStationIds))
            };
        });
        return { ...meta, counts, directions };
    });
    const stationsByName = new Map();
    for (const type of types) {
        if (!stationsByName.has(type.name)) stationsByName.set(type.name, new Set());
        const stations = stationsByName.get(type.name);
        for (const trip of roots.filter((trip) => trip.y === type.id)) for (const id of stopIds(trip)) stations.add(id);
    }
    const stopsByName = new Map([...stationsByName].map(([name, ids]) => [name, ids.size]));
    const order = sortTypeNamesByBaseAndStopCount(types.map((type) => type.name), null, stopsByName);
    return types.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
};

const buildJunctions = (stations, edges, patterns) => {
    const adjacency = new Map(stations.map((station) => [station.id, []]));
    const byPair = new Map(edges.map((edge) => [edgeKey(edge.from, edge.to), edge.id]));
    for (const edge of edges) {
        adjacency.get(edge.from).push(edge.id);
        adjacency.get(edge.to).push(edge.id);
    }
    return stations.filter((station) => adjacency.get(station.id).length > 2).map((station) => {
        const connections = new Map();
        for (const pattern of patterns) for (const path of pattern.paths) {
            for (let i = 1; i < path.length - 1; i += 1) {
                if (path[i] !== station.id) continue;
                const connection = {
                    typeId: pattern.typeId, direction: pattern.direction,
                    fromEdgeId: byPair.get(edgeKey(path[i - 1], path[i])),
                    toEdgeId: byPair.get(edgeKey(path[i], path[i + 1]))
                };
                connections.set(JSON.stringify(connection), connection);
            }
        }
        return { stationId: station.id, edgeIds: adjacency.get(station.id), connections: [...connections.values()] };
    });
};

/**
 * 将现有线路、班次与同站关系处理为单张线路图的数据。
 * 输出拓扑与停站关系，不包含坐标、空间分配或绘图指令。
 */
export const buildLineServiceDiagramData = async ({
    lineId, rootTrips, trips, railways, stations, stationGroups, trainTypes, railDirections = []
}) => {
    const roots = selectDiagramTrips(rootTrips);
    const tripById = new Map(trips.map((trip) => [tripId(trip), trip]));
    const runs = buildTripChains(roots, tripById);
    const topology = buildStationTopology({ lineId, railways, stations, stationGroups, runs });
    const processed = buildServicePatterns(roots, runs, topology);
    const nodes = await buildDiagramTransfers({
        stations: buildDisplayStations(processed, topology), stationGroups, topology
    });
    const edges = [...processed.edges.values()].map((edge) => ({ ...edge, lineIds: [...edge.lineIds] }));
    const line = topology.lineById.get(lineId);
    const directionById = new Map(railDirections.map((direction) => [direction.id, direction]));
    return {
        selectedLine: { id: lineId, name: title(line.title) || lineId, color: line.color, stationOrder: topology.displayOrder },
        directions: unique(roots.map((trip) => trip.d)).sort().map((id) => ({ id, name: title(directionById.get(id)?.title) || id })),
        trainTypes: buildTrainTypes(roots, processed.servicePatterns, trainTypes),
        ...buildDiagramServices(runs, processed, topology, trainTypes, railDirections),
        topology: {
            stations: nodes, edges, junctions: buildJunctions(nodes, edges, processed.servicePatterns),
            lineOrders: [...topology.orders].map(([id, path]) => {
                const name = title(topology.lineById.get(id)?.title) || id;
                const mainId = resolveMainLineIdByBranchRule(id, (candidate) => topology.orders.has(candidate));
                return {
                    lineId: id, name,
                    displayLineId: title(topology.lineById.get(mainId)?.title) === name ? mainId : id,
                    paths: projectPaths(path, processed.edges, processed.stationIds)
                };
            }).filter((order) => order.paths.length)
        },
        routes: processed.routes, servicePatterns: processed.servicePatterns, processing: processed.processing
    };
};

import { sortTypeNamesByBaseAndStopCount } from '../lib/train-type-sort.js';
import { addCount, buildTripChains, emptyCounts, selectDiagramTrips, serviceDay, stopIds, text, title, tripId, unique } from './lineServiceDiagram/trips.js';
import { buildStationTopology, edgeKey } from './lineServiceDiagram/topology.js';
import { buildServicePatterns, projectPaths } from './lineServiceDiagram/patterns.js';
import { buildDiagramTransfers } from './lineServiceDiagram/transfers.js';

const buildTrainTypes = (roots, patterns, metadata, topology) => {
    const byId = new Map(metadata.map((type) => [type.id, type]));
    const types = unique(roots.map((trip) => text(trip.y))).map((id) => {
        const trips = roots.filter((trip) => trip.y === id);
        const name = title(byId.get(id)?.title) || id;
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
        const localLike = name.includes('普通') || name.includes('各停') || name.includes('各站停车') || name.includes('各駅停車') || name.toLowerCase() === 'local';
        return { id, name, color: localLike ? '#888' : text(byId.get(id)?.title?.color) || '#888', counts, directions };
    });
    const countByName = new Map(), stopsByName = new Map();
    const visibleStations = new Set(topology.displayOrder);
    for (const type of types) {
        countByName.set(type.name, (countByName.get(type.name) || 0) + roots.filter((trip) => trip.y === type.id).length);
        const stops = roots.filter((trip) => trip.y === type.id).flatMap((trip) => stopIds(trip).map(topology.canon).filter((id) => visibleStations.has(id)));
        stopsByName.set(type.name, new Set([...(stopsByName.get(type.name) || []), ...stops]));
    }
    const order = sortTypeNamesByBaseAndStopCount(types.map((type) => type.name), countByName, new Map([...stopsByName].filter(([, ids]) => ids.size).map(([name, ids]) => [name, ids.size])));
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
        stations: [...processed.stationIds].map(topology.station), stationGroups, railways, topology
    });
    const edges = [...processed.edges.values()].map((edge) => ({ ...edge, lineIds: [...edge.lineIds] }));
    const line = topology.lineById.get(lineId);
    const directionById = new Map(railDirections.map((direction) => [direction.id, direction]));
    return {
        selectedLine: { id: lineId, name: title(line.title) || lineId, color: line.color, stationOrder: topology.displayOrder },
        directions: unique(roots.map((trip) => trip.d)).sort().map((id) => ({ id, name: title(directionById.get(id)?.title) || id })),
        trainTypes: buildTrainTypes(roots, processed.servicePatterns, trainTypes, topology),
        topology: {
            stations: nodes, edges, junctions: buildJunctions(nodes, edges, processed.servicePatterns),
            lineOrders: [...topology.orders].map(([id, path]) => ({
                lineId: id, name: title(topology.lineById.get(id)?.title) || id,
                paths: projectPaths(path, processed.edges, processed.stationIds)
            })).filter((order) => order.paths.length)
        },
        routes: processed.routes, servicePatterns: processed.servicePatterns, processing: processed.processing
    };
};

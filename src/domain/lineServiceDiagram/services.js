import { sortTrainTypesByCompanyOrder } from '../trainTypeOrder.js';
import { addCount, emptyCounts, serviceDay, title, tripId, unique } from './trips.js';
import { edgeKey } from './topology.js';

const typeKey = (id) => id.split('.').at(-1);

export const diagramTypeMeta = (id, metadata) => {
    const source = metadata.get(id), name = title(source?.title) || id;
    const local = name.includes('普通') || name.includes('各停') || name.includes('各站停车') || name.includes('各駅停車') || name.toLowerCase() === 'local';
    return { id, name, color: local ? '#888' : source?.title?.color || '#888' };
};

const sortTypes = (types, metadata) => {
    const counts = new Map(), stops = new Map();
    for (const type of types) {
        counts.set(type.name, (counts.get(type.name) || 0) + type.totalTrips);
        stops.set(type.name, Math.min(stops.get(type.name) ?? Infinity, type.minStopCount));
    }
    return sortTrainTypesByCompanyOrder(types, counts, stops, metadata);
};

// 真实班次只按经过区段聚合；派生种别束不改变已有站点、边或交路。
export const buildDiagramServices = (runs, processed, topology, metadata, railDirections) => {
    const typeById = new Map(metadata.map((type) => [type.id, type]));
    const directionById = new Map(railDirections.map((direction) => [direction.id, direction]));
    const lineOrder = new Map([...topology.orders.keys()].map((id, index) => [id, index]));
    const records = new Map(), stops = [];
    const edgeTrips = new Map([...processed.edges].map(([key, edge]) => [key, { edge, trips: new Map() }]));
    for (const run of runs) for (let index = 0; index < run.segments.length; index += 1) {
        const segment = run.segments[index], trip = run.chain[index], id = tripId(trip);
        if (!records.has(id)) records.set(id, { trip, segment });
        const record = records.get(id), previous = run.segments[index - 1];
        for (let at = 1; at < segment.path.length; at += 1) {
            edgeTrips.get(edgeKey(segment.path[at - 1], segment.path[at])).trips.set(id, record);
        }
        if (previous && previous.path.at(-1) !== segment.path[0]) {
            edgeTrips.get(edgeKey(previous.path.at(-1), segment.path[0])).trips.set(id, record);
        }
        let cursor = 0;
        for (const stationId of segment.stops) {
            const at = segment.path.indexOf(stationId, cursor);
            cursor = at + 1;
            // 同站接续由到站段记录停站；离站后的轨迹使用下一段种别。
            if (at === 0 && previous?.path.at(-1) === stationId) continue;
            const from = at > 0 ? segment.path[at - 1] : previous?.path.at(-1);
            const to = segment.path[at + 1];
            stops.push({ stationId, record, edge: from ? edgeKey(from, stationId) : to ? edgeKey(stationId, to) : null });
        }
    }

    const bundles = new Map(), bundleByEdge = new Map();
    const getBundle = (lineIds, keys) => {
        const key = JSON.stringify([lineIds, keys]);
        if (!bundles.has(key)) bundles.set(key, {
            id: `bundle-${bundles.size + 1}`, lineIds, edgeIds: [], types: new Map()
        });
        return bundles.get(key);
    };
    const addTrip = (bundle, record) => {
        const key = typeKey(record.segment.typeId);
        if (!bundle.types.has(key)) bundle.types.set(key, { key, trips: new Map(), stops: new Map() });
        const type = bundle.types.get(key);
        type.trips.set(tripId(record.trip), record);
        return type;
    };
    for (const [key, { edge, trips }] of edgeTrips) {
        if (!trips.size) continue;
        const entries = [...trips.values()];
        const lineIds = unique(entries.map(({ segment }) => segment.lineId)).sort((a, b) => lineOrder.get(a) - lineOrder.get(b));
        const keys = unique(entries.map(({ segment }) => typeKey(segment.typeId))).sort();
        const bundle = getBundle(lineIds, keys);
        bundle.edgeIds.push(edge.id);
        bundleByEdge.set(key, bundle);
        for (const record of entries) addTrip(bundle, record);
    }
    for (const { stationId, record, edge } of stops) {
        const bundle = bundleByEdge.get(edge) || getBundle([record.segment.lineId], [typeKey(record.segment.typeId)]);
        const type = addTrip(bundle, record);
        const ascending = record.segment.direction === topology.lineById.get(record.segment.lineId).ascending;
        if (!type.stops.has(ascending)) type.stops.set(ascending, new Set());
        type.stops.get(ascending).add(stationId);
    }

    const describeType = (entry, lineIds, stationIds) => {
        const entries = [...entry.trips.values()];
        const sourceTypeIds = unique(entries.map(({ segment }) => segment.typeId));
        const preferred = lineIds.map((lineId) => sourceTypeIds.find((id) => id.split('.')[0] === lineId.split('.')[0])).find(Boolean) || sourceTypeIds[0];
        const directions = new Map(), counts = emptyCounts();
        for (const { trip, segment } of entries) {
            const ascending = segment.direction === topology.lineById.get(segment.lineId).ascending;
            if (!directions.has(ascending)) directions.set(ascending, {
                ascending, ids: new Set(), stationIds: new Set(), counts: emptyCounts()
            });
            const direction = directions.get(ascending);
            direction.ids.add(segment.direction);
            for (const id of segment.path) if (stationIds.has(id)) direction.stationIds.add(id);
            addCount(direction.counts, serviceDay(trip));
            addCount(counts, serviceDay(trip));
        }
        return {
            key: entry.key, ...diagramTypeMeta(preferred, typeById), sourceTypeIds, counts,
            totalTrips: entries.length, minStopCount: Math.min(...entries.map(({ trip }) => trip.tt.length)),
            directions: [...directions.values()].sort((a, b) => Number(b.ascending) - Number(a.ascending)).map((direction) => ({
                ascending: direction.ascending, ids: [...direction.ids],
                names: [...direction.ids].map((id) => title(directionById.get(id)?.title) || id),
                counts: direction.counts,
                stationIds: unique([...direction.stationIds, ...(entry.stops.get(direction.ascending) || [])]),
                stopStationIds: [...(entry.stops.get(direction.ascending) || [])]
            }))
        };
    };
    const edgeById = new Map([...processed.edges.values()].map((edge) => [edge.id, edge]));
    const legend = new Map();
    const serviceBundles = [...bundles.values()].map((bundle) => {
        const stationIds = new Set(bundle.edgeIds.flatMap((id) => {
            const edge = edgeById.get(id);
            return [edge.from, edge.to];
        }));
        const types = sortTypes([...bundle.types.values()].map((entry) => describeType(entry, bundle.lineIds, stationIds)), typeById);
        for (const type of types) {
            const key = JSON.stringify([type.name, type.color]);
            if (!legend.has(key)) legend.set(key, { entry: { key: type.key, trips: new Map(), stops: new Map() }, lineIds: bundle.lineIds, meta: type });
            const entry = legend.get(key).entry;
            for (const [id, record] of bundle.types.get(type.key).trips) entry.trips.set(id, record);
        }
        return { id: bundle.id, lineIds: bundle.lineIds, edgeIds: bundle.edgeIds, types };
    });
    const serviceLegend = sortTypes([...legend.values()].map(({ entry, lineIds, meta }) => ({
        ...describeType(entry, lineIds, new Set()), id: meta.id, name: meta.name, color: meta.color
    })), typeById);
    return { serviceBundles, serviceLegend };
};

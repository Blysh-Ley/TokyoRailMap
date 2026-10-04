import { hasTripNmMarker } from '../timetableTripMarkers.js';

export const text = (value) => String(value ?? '').trim();
export const title = (value) => text(value?.['zh-Hans'] || value?.zh || value?.['zh-CN'] || value?.['zh-Hant'] || value?.ja || value?.en);
export const tripId = (trip) => text(trip?.id || trip?.t);
export const lineIdOf = (id) => text(id).split('.').slice(0, 2).join('.');
export const stopIds = (trip) => (trip?.tt || []).map((row) => text(row.s)).filter(Boolean);
export const unique = (values) => [...new Set(values)];
export const consecutive = (values) => values.filter((value, index) => !index || value !== values[index - 1]);
export const emptyCounts = () => ({ Weekday: 0, SaturdayHoliday: 0 });
export const totalCounts = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);
export const addCount = (counts, day) => { counts[day] = (counts[day] || 0) + 1; };

export const tripRefs = (trip, key) => {
    const value = trip?.[key];
    if (Array.isArray(value)) return unique(value.map(text).filter(Boolean));
    if (!value) return [];
    const raw = text(value);
    if (raw.startsWith('[')) return unique(JSON.parse(raw).map(text).filter(Boolean));
    return [raw];
};

export const serviceDay = (trip) => {
    const day = tripId(trip).match(/\.(Weekday|SaturdayHoliday|Saturday|Sunday|Holiday)(?:\.\d+)?$/)?.[1];
    if (day === 'Weekday') return day;
    if (day) return 'SaturdayHoliday';
    return 'Unknown';
};

// 沿用原图的班次入口口径；附属记录仍可作为直通引用参与拓扑。
export const selectDiagramTrips = (trips) => {
    const originals = trips.filter((trip) => !/\.(1|2)$/.test(tripId(trip)));
    return (originals.length ? originals : trips).filter((trip) => !hasTripNmMarker(trip));
};

export const buildTripChains = (roots, tripById) => {
    const memo = { pt: new Map(), nt: new Map() };
    const follow = (trip, key, visiting = new Set()) => {
        const id = tripId(trip);
        if (visiting.has(id)) throw new Error(`班次直通关系存在循环：${id}`);
        if (memo[key].has(id)) return memo[key].get(id);
        const nextVisiting = new Set(visiting).add(id);
        const refs = tripRefs(trip, key);
        const chains = refs.length ? refs.flatMap((ref) => {
            const next = tripById.get(ref);
            if (!next) throw new Error(`缺少直通班次：${ref}（来自 ${id}）`);
            return follow(next, key, nextVisiting).map((tail) => [trip, ...tail]);
        }) : [[trip]];
        memo[key].set(id, chains);
        return chains;
    };
    return roots.flatMap((root) => follow(root, 'pt').flatMap((before) => (
        follow(root, 'nt').map((after) => ({
            root,
            chain: [...before.slice(1).reverse(), root, ...after.slice(1)]
        }))
    )));
};

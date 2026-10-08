// 只计算整束的横向平移，种别顺序和束内轨迹保持原样。
export const getServiceBundleShifts = (data) => {
    const bundles = data.serviceBundles;
    const edgeById = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const stationBundles = new Map(), stationEdges = new Map();
    for (const bundle of bundles) for (const edgeId of bundle.edgeIds) {
        const edge = edgeById.get(edgeId);
        for (const id of [edge.from, edge.to]) {
            if (!stationBundles.has(id)) { stationBundles.set(id, new Set()); stationEdges.set(id, new Set()); }
            stationBundles.get(id).add(bundle);
            stationEdges.get(id).add(edgeId);
        }
    }
    const adjacent = new Map(bundles.map((bundle) => [bundle, []]));
    for (const [stationId, entries] of stationBundles) {
        const local = [...entries];
        for (let i = 0; i < local.length; i += 1) for (let j = i + 1; j < local.length; j += 1) {
            const a = local[i], b = local[j];
            // 每段都独立匹配相接区段，共线线路也不共用偏移量。
            const shift = transitionShift(a, b, stationEdges.get(stationId).size > 2);
            adjacent.get(a).push({ next: b, shift });
            adjacent.get(b).push({ next: a, shift: -shift });
        }
    }
    const ordered = bundles.slice().sort((a, b) => Number(b.lineIds.includes(data.selectedLine.id)) - Number(a.lineIds.includes(data.selectedLine.id))
        || b.edgeIds.length - a.edgeIds.length);
    const shifts = new Map();
    for (const root of ordered) {
        if (shifts.has(root)) continue;
        shifts.set(root, 0);
        const pending = [root];
        for (let index = 0; index < pending.length; index += 1) for (const { next, shift } of adjacent.get(pending[index])) {
            if (shifts.has(next)) continue;
            shifts.set(next, shifts.get(pending[index]) + shift);
            pending.push(next);
        }
    }
    return new Map(bundles.map((bundle) => [bundle.id, shifts.get(bundle)]));
};

const transitionShift = (before, after, branch) => {
    if (before.types.length === after.types.length) return 0;
    const smaller = before.types.length < after.types.length ? before : after;
    const larger = smaller === before ? after : before;
    const small = smaller.types.map((type) => type.id.split('.')[1]);
    const large = larger.types.map((type) => type.id.split('.')[1]);
    let start = large.findIndex((_, index) => small.every((type, offset) => large[index + offset] === type));
    let shift;
    if (start >= 0) shift = (start - (large.length - small.length) / 2) * 20;
    else {
        const right = large.indexOf(small.at(-1));
        if (right >= 0) {
            start = right - small.length + 1;
            shift = (start - (large.length - small.length) / 2) * 20;
        } else shift = branch ? 10 : 0;
    }
    return smaller === after ? shift : -shift;
};

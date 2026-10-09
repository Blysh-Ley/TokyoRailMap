// 只计算整束的横向平移，种别顺序和束内轨迹保持原样。
export const getServiceBundleShifts = (data, positions) => {
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
        const local = [...entries].map((bundle) => ({ bundle, sides: bundle.edgeIds.flatMap((id) => {
            const edge = edgeById.get(id);
            if (edge.from !== stationId && edge.to !== stationId) return [];
            const other = edge.from === stationId ? edge.to : edge.from;
            return [Math.sign(positions.get(other).y - positions.get(stationId).y)];
        }) }));
        for (let i = 0; i < local.length; i += 1) for (let j = i + 1; j < local.length; j += 1) {
            const a = local[i].bundle, b = local[j].bundle;
            // 分叉和合并都对齐接续站另一侧的区段，同侧支路不互相决定偏移。
            if (!local[i].sides.some((side) => local[j].sides.includes(-side))) continue;
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

// 两端要求不同偏移时，保留区段位置，在接续弯道内补足与另一侧直行区段的差值。
export const getServiceEdgeShifts = (data, positions, bends, shifts) => {
    const edgeById = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const bundleByEdge = new Map(data.serviceBundles.flatMap((bundle) => bundle.edgeIds.map((id) => [id, bundle])));
    const adjacent = new Map();
    for (const id of bundleByEdge.keys()) {
        const edge = edgeById.get(id);
        for (const stationId of [edge.from, edge.to]) {
            if (!adjacent.has(stationId)) adjacent.set(stationId, []);
            adjacent.get(stationId).push(edge);
        }
    }
    const result = new Map();
    for (const [id, bundle] of bundleByEdge) {
        if (!bends.get(id)?.side) continue;
        const edge = edgeById.get(id), offsets = { from: 0, to: 0 };
        for (const end of ['from', 'to']) {
            const stationId = edge[end], point = positions.get(stationId);
            const side = Math.sign(positions.get(end === 'from' ? edge.to : edge.from).y - point.y);
            const other = adjacent.get(stationId).find((candidate) => !bends.has(candidate.id)
                && Math.sign(positions.get(candidate.from === stationId ? candidate.to : candidate.from).y - point.y) === -side);
            if (!other) continue;
            const target = bundleByEdge.get(other.id);
            offsets[end] = shifts.get(target.id) + transitionShift(target, bundle, adjacent.get(stationId).length > 2) - shifts.get(bundle.id);
        }
        if (offsets.from || offsets.to) result.set(id, offsets);
    }
    return result;
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

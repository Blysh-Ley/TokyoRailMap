// 标注只比较相接区段；公司前缀不是种别身份，顺序、名称和颜色仍参与比较。
const signature = (types) => JSON.stringify(types.map((type) => [type.key, type.name, type.color]));

export const buildServiceLabelSections = (data) => {
    const edgeById = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const bundleByEdge = new Map(data.serviceBundles.flatMap((bundle) => bundle.edgeIds.map((id) => [id, bundle])));
    const adjacent = new Map(data.topology.stations.map(({ id }) => [id, []]));
    for (const id of bundleByEdge.keys()) {
        const edge = edgeById.get(id);
        adjacent.get(edge.from).push(id);
        adjacent.get(edge.to).push(id);
    }
    const keys = new Map(data.serviceBundles.map((bundle) => [bundle.id, signature(bundle.types)]));
    const sections = [], sectionByEdge = new Map();
    for (const [edgeId, bundle] of bundleByEdge) {
        if (sectionByEdge.has(edgeId)) continue;
        const section = { edgeIds: [edgeId], stationIds: new Set(), types: bundle.types,
            signature: keys.get(bundle.id), isCurrent: false };
        sections.push(section); sectionByEdge.set(edgeId, section);
        for (let index = 0; index < section.edgeIds.length; index += 1) {
            const id = section.edgeIds[index], edge = edgeById.get(id);
            section.isCurrent ||= bundleByEdge.get(id).lineIds.includes(data.selectedLine.id);
            for (const stationId of [edge.from, edge.to]) {
                section.stationIds.add(stationId);
                // 分岔处分别建立区段，防止两条同种别支路被合成一次标注。
                if (adjacent.get(stationId).length !== 2) continue;
                for (const next of adjacent.get(stationId)) {
                    if (sectionByEdge.has(next) || keys.get(bundleByEdge.get(next).id) !== section.signature) continue;
                    sectionByEdge.set(next, section); section.edgeIds.push(next);
                }
            }
        }
    }
    const order = data.selectedLine.stationOrder.slice().reverse();
    const rank = (section) => Math.min(...[...section.stationIds].map((id) => {
        const index = order.indexOf(id);
        return index < 0 ? Infinity : index;
    }));
    const roots = sections.slice().sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || rank(a) - rank(b));
    const visited = new Set(), labels = [];
    for (const root of roots) {
        if (visited.has(root)) continue;
        const anchorId = order.find((id) => root.stationIds.has(id)) || root.stationIds.values().next().value;
        const pending = [{ section: root, stationId: anchorId, required: true, primary: !labels.length }];
        visited.add(root);
        for (let index = 0; index < pending.length; index += 1) {
            const { section, stationId, required, primary } = pending[index];
            if (required) labels.push({ edgeIds: section.edgeIds, types: section.types, isCurrent: section.isCurrent,
                anchorId: stationId, primary,
                entryEdgeIds: primary ? adjacent.get(stationId).filter((id) => keys.get(bundleByEdge.get(id).id) === section.signature) : [] });
            const nextSections = [...section.stationIds].flatMap((id) => adjacent.get(id).map((edgeId) => ({
                section: sectionByEdge.get(edgeId), stationId: id
            }))).sort((a, b) => Number(b.section.isCurrent) - Number(a.section.isCurrent) || rank(a.section) - rank(b.section));
            for (const next of nextSections) {
                if (visited.has(next.section)) continue;
                visited.add(next.section);
                pending.push({ ...next, required: next.section.signature !== section.signature, primary: false });
            }
        }
    }
    // 当前线路的所有组合先取得位置，其他直通区段再按遍历顺序安排。
    return labels.sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.isCurrent) - Number(a.isCurrent));
};

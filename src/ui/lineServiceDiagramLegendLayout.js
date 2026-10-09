// 图例公司顺序取最终直通区段的位置，不使用可能被避让移动的线路名称牌。
export const layoutDiagramLegendRows = (data, layout, serviceTracks) => {
    const edges = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const position = (company) => {
        const points = company.stationIds.map((id) => layout.positions.get(id));
        const typeIds = new Set(company.types.map((type) => type.id));
        for (const edgeId of company.edgeIds) {
            const edge = edges.get(edgeId), from = layout.positions.get(edge.from), to = layout.positions.get(edge.to);
            for (const track of serviceTracks.get(edgeId).filter((track) => track.type.sourceTypeIds.some((id) => typeIds.has(id)))) {
                const a = { x: from.x + track.endpointOffsets.get(edge.from), y: from.y };
                const b = { x: to.x + track.endpointOffsets.get(edge.to), y: to.y };
                const offset = track.offset - track.shift, bend = layout.bends.get(edgeId);
                let top = Math.min(a.y, b.y), left = Math.min(a.x, b.x);
                if (layout.loops.has(edgeId)) {
                    top -= (bend.radius || 0) + offset;
                    left = Math.min(left, layout.loopX - offset + track.shift);
                } else if (a.x !== b.x && !layout.trackPaths?.has(edgeId)) {
                    const height = bend?.height || Math.abs(b.y - a.y);
                    const start = (bend?.side === 'before' ? Math.max(a.y, b.y) - height : top) + (bend?.padding ?? 24);
                    const radius = Math.min(bend?.radius ?? (height - 48) / 2, Math.abs(a.x - b.x) / 2);
                    const sign = a.y <= b.y ? Math.sign(b.x - a.x) : Math.sign(a.x - b.x);
                    top = Math.min(top, start, start + radius - sign * offset, start + radius * 2);
                }
                points.push({ x: left, y: top });
            }
        }
        return { top: Math.min(...points.map((point) => point.y)), left: Math.min(...points.map((point) => point.x)) };
    };
    const currentCompany = data.selectedLine.id.split('.')[0];
    const sameCompany = data.companyLegends.filter((company) => company.companyId === currentCompany);
    const otherCompanies = data.companyLegends.filter((company) => company.companyId !== currentCompany)
        .map((company) => ({ company, ...position(company) }))
        .sort((a, b) => a.top - b.top || a.left - b.left)
        .map(({ company }) => company);
    return [{ companyId: '', types: data.currentLegend }, ...sameCompany, ...otherCompanies];
};

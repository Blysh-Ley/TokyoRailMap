// 文字占位和轨道渲染共用绘制顺序及接点遮罩，避免文字落入实际断口。
export const getDiagramDrawingEdges = (data, layout) => data.topology.edges.slice()
    .sort((a, b) => Number(layout.bends.has(a.id)) - Number(layout.bends.has(b.id)));

export const getDiagramCrossingTracks = (edge, layout, straightEdges, serviceTracks) =>
    layout.bends.has(edge.id) && !layout.loops.has(edge.id) ? straightEdges
        .filter((other) => [edge.from, edge.to].some((id) => other.from === id || other.to === id))
        .flatMap((other) => serviceTracks.get(other.id).map((track) => ({ track,
            stationId: [edge.from, edge.to].find((id) => other.from === id || other.to === id)
        }))) : [];

export const getDiagramTrackOccluders = (track, crossingTracks) => crossingTracks
    .filter(({ track: other, stationId }) => other.endpointOffsets.get(stationId) !== track.endpointOffsets.get(stationId))
    .map(({ track: other }) => other);

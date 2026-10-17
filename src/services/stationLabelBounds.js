// 当前帧锚点优先；原生回退路径直接读取已经放置成功的文字和背景框。
export const readRenderedStationLabelBounds = ({ map, frameRecords }) => {
    if (Array.isArray(frameRecords)) {
        return frameRecords.filter(record => record.bounds).map(record => ({
            id: record.properties.id,
            minX: record.screenPoint.x + record.bounds.left * (record.perspectiveRatio ?? 1),
            maxX: record.screenPoint.x + record.bounds.right * (record.perspectiveRatio ?? 1),
            minY: record.screenPoint.y + record.bounds.top * (record.perspectiveRatio ?? 1),
            maxY: record.screenPoint.y + record.bounds.bottom * (record.perspectiveRatio ?? 1)
        }));
    }
    const placement = map.style?.placement;
    const index = placement?.collisionIndex;
    if (!index || map.getLayoutProperty('station-labels-layer', 'visibility') === 'none') return [];
    const paddingX = (index.grid.width - index.transform.width) / 2;
    const paddingY = (index.grid.height - index.transform.height) / 2;
    const bounds = new Map();
    index.grid.boxKeys.forEach((key, i) => {
        const retained = placement.retainedQueryData[key.bucketInstanceId];
        if (!retained?.featureIndex.bucketLayerIDs[retained.bucketIndex]?.includes('station-labels-layer')) return;
        const id = `${key.bucketInstanceId}:${key.featureIndex}`;
        const [minX, minY, maxX, maxY] = index.grid.bboxes.slice(i * 4, i * 4 + 4);
        const box = { id, minX: minX - paddingX, minY: minY - paddingY, maxX: maxX - paddingX, maxY: maxY - paddingY };
        const previous = bounds.get(id);
        bounds.set(id, previous ? { id, minX: Math.min(previous.minX, box.minX), minY: Math.min(previous.minY, box.minY),
            maxX: Math.max(previous.maxX, box.maxX), maxY: Math.max(previous.maxY, box.maxY) } : box);
    });
    return [...bounds.values()];
};

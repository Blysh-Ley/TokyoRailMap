// Point-symbol meshes retain their glyph/icon layout and placement opacity.
// Only the Float32 anchor attributes change; no glyph shaping or source work.
export function createStationLabelAnchorBuffers({ text, icon, instances, getStationId }) {
    const parts = [];
    const ranges = (buffers) => {
        let start = 0;
        return Array.from({ length: buffers.placedSymbolArray.length }, (_, index) => {
            const symbol = buffers.placedSymbolArray.get(index);
            const range = { buffers, start, count: symbol.numGlyphs * 4 };
            start += range.count;
            return range;
        });
    };
    const textRanges = ranges(text);
    const iconRanges = ranges(icon);
    for (let i = 0; i < instances.length; i += 1) {
        const instance = instances.get(i);
        const id = getStationId(instance.featureIndex);
        const textIndices = [...new Set([instance.rightJustifiedTextSymbolIndex,
            instance.centerJustifiedTextSymbolIndex, instance.leftJustifiedTextSymbolIndex,
            instance.verticalPlacedTextSymbolIndex])].filter((index) => index >= 0);
        const iconIndices = [...new Set([instance.placedIconSymbolIndex,
            instance.verticalPlacedIconSymbolIndex])].filter((index) => index >= 0);
        const partRanges = [...textIndices.map((index) => textRanges[index]),
            ...iconIndices.map((index) => iconRanges[index])].filter(Boolean);
        const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const { buffers, start, count } of partRanges) {
            const layout = buffers.layoutVertexArray.int16;
            const fontScale = buffers === text ? 12 / 24 : 1;
            for (let vertex = start; vertex < start + count; vertex += 1) {
                const offset = vertex * 12;
                const x = layout[offset + 2] / 32 * fontScale + layout[offset + 8] / 16;
                const y = layout[offset + 3] / 32 * fontScale + layout[offset + 9] / 16;
                bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
                bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
            }
        }
        parts.push({ id, ranges: partRanges, bounds });
    }
    const baseline = [text, icon].map((buffers) => ({ buffers,
        anchors: buffers.dynamicLayoutVertexArray.float32.slice() }));
    return {
        parts,
        restore: () => baseline.forEach(({ buffers, anchors }) => buffers.dynamicLayoutVertexArray.float32.set(anchors)),
        move: (part, point) => {
            for (const { buffers, start, count } of part.ranges) {
                const array = buffers.dynamicLayoutVertexArray.float32;
                for (let vertex = start; vertex < start + count; vertex += 1) {
                    array[vertex * 3] = point.x;
                    array[vertex * 3 + 1] = point.y;
                }
            }
        }
    };
}

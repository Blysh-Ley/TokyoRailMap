const defaultToText = (value) => String(value ?? '').trim();

export const buildPanelTripDetailSegmentBlocks = ({
    segmentsWithPast,
    throughCategoryLabel = '',
    throughCategoryColor = '',
    currentLineDesc = null,
    buildLineDescriptor = () => null,
    isSameLineName = () => false,
    toText = defaultToText
} = {}) => {
    const segments = Array.isArray(segmentsWithPast) ? segmentsWithPast : [];
    const blocks = [];

    if (toText(throughCategoryLabel)) {
        const mainSegForType = segments.find((seg) => seg?.kind === 'main') || segments[0] || null;
        const mergedColor = toText(throughCategoryColor)
            || toText(currentLineDesc?.color)
            || toText(mainSegForType?.typeColor)
            || toText(buildLineDescriptor(mainSegForType?.lineId)?.color);
        blocks.push({
            lineId: '__through-category__',
            descriptor: {
                lineId: '__through-category__',
                text: toText(throughCategoryLabel),
                color: mergedColor || null
            },
            typeName: toText(mainSegForType?.typeName),
            typeColor: toText(mainSegForType?.typeColor),
            segments: segments.slice()
        });
        return blocks;
    }

    for (const seg of segments) {
        const lastBlock = blocks.length ? blocks[blocks.length - 1] : null;
        const sameLine = !!lastBlock && isSameLineName(lastBlock.lineId, seg.lineId);
        if (!sameLine) {
            blocks.push({
                lineId: seg.lineId,
                descriptor: buildLineDescriptor(seg.lineId) || (seg.kind === 'main' ? currentLineDesc : null),
                typeName: toText(seg.typeName),
                typeColor: toText(seg.typeColor),
                segments: [seg]
            });
            continue;
        }

        lastBlock.segments.push(seg);
        if (!toText(lastBlock.typeName) && toText(seg.typeName)) {
            lastBlock.typeName = toText(seg.typeName);
        }
        if (!toText(lastBlock.typeColor) && toText(seg.typeColor)) {
            lastBlock.typeColor = toText(seg.typeColor);
        }
    }

    return blocks;
};

const defaultToText = (value) => String(value ?? '').trim();

export const resolvePanelTimetableTripKey = (row, {
    toText = defaultToText
} = {}) => {
    const item = row || {};
    return toText(item.realOriginId) || toText(item.tripKey) || toText(item.id);
};

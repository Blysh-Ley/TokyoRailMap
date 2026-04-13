const toText = (v) => String(v ?? '').trim();

export const LINE_TYPE_EXCLUSION_RULES = [
    ['JR-East.ChuoSobuLocal', 'JR-East.LimitedExpress']
];

const LINE_TYPE_EXCLUSION_KEYS = new Set(
    LINE_TYPE_EXCLUSION_RULES
        .map((pair) => {
            const lineId = toText(pair?.[0]);
            const typeId = toText(pair?.[1]);
            if (!lineId || !typeId) return '';
            return `${lineId}||${typeId}`;
        })
        .filter(Boolean)
);

export const isExcludedLineType = (lineIdRaw, typeIdRaw) => {
    const lineId = toText(lineIdRaw);
    const typeId = toText(typeIdRaw);
    if (!lineId || !typeId) return false;
    return LINE_TYPE_EXCLUSION_KEYS.has(`${lineId}||${typeId}`);
};

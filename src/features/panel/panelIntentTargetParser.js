const defaultToText = (value) => String(value ?? '').trim();

export const findPanelTripTarget = (target, {
    elementCtor = globalThis.Element
} = {}) => {
    if (!(target instanceof elementCtor)) return null;
    return target.closest?.('.panel-timetable-row[data-trip-key], .panel-grid-cell[data-trip-key]') || null;
};

export const resolvePanelInteractionKeyFromTarget = (target, {
    body,
    findTripTarget = findPanelTripTarget,
    getDirFilterButtonTarget = () => null,
    getDirPrintButtonTarget = () => null,
    getDirTitleTarget = () => null,
    getDirTriangleTarget = () => null,
    getLineTarget = () => '',
    getCompanyTarget = () => '',
    makeLineDirKey = () => '',
    toText = defaultToText
} = {}) => {
    const rowEl = findTripTarget(target);
    if (rowEl && body?.contains?.(rowEl)) {
        const lineEl = rowEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const tripKey = rowEl.getAttribute?.('data-trip-key');
        if (lineId && tripKey) return `trip:${String(lineId)}||${String(tripKey)}`;
    }

    const dirFilter = getDirFilterButtonTarget(target);
    if (dirFilter) return `dir:${makeLineDirKey(dirFilter.lineId, dirFilter.dirKey)}`;

    const dirPrint = getDirPrintButtonTarget(target);
    if (dirPrint) return `dir:${makeLineDirKey(dirPrint.lineId, dirPrint.dirKey)}`;

    const dirTitle = getDirTitleTarget(target);
    if (dirTitle) return `dir:${makeLineDirKey(dirTitle.lineId, dirTitle.dirKey)}`;

    const dirTriangle = getDirTriangleTarget(target);
    if (dirTriangle) return `dir:${makeLineDirKey(dirTriangle.lineId, dirTriangle.dirKey)}`;

    const lineId = getLineTarget(target);
    if (lineId) return `line:${String(lineId)}`;

    const company = getCompanyTarget(target);
    if (company) return `company:${String(company)}`;

    return toText('');
};

export const resolvePanelMousePrimaryTarget = (target, {
    getDirTitleTarget = () => null,
    getLineTarget = () => '',
    getCompanyTarget = () => '',
    makeLineDirKey = () => ''
} = {}) => {
    const dirTitle = getDirTitleTarget(target);
    if (dirTitle) {
        const key = makeLineDirKey(dirTitle.lineId, dirTitle.dirKey);
        return { kind: 'dir', key: `dir:${key}`, lineId: dirTitle.lineId, dirKey: dirTitle.dirKey, lineDirKey: key };
    }

    const lineId = getLineTarget(target);
    if (lineId) return { kind: 'line', key: `line:${String(lineId)}`, lineId: String(lineId) };

    const companyName = getCompanyTarget(target);
    if (companyName) return { kind: 'company', key: `company:${String(companyName)}`, companyName: String(companyName) };

    return null;
};

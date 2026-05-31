const defaultToText = (value) => String(value ?? '').trim();

export const collectLinePrintPayloads = ({
    lineEl,
    lineId,
    dirPrintPayloadByKey,
    makeLineDirKey,
    toText = defaultToText
} = {}) => {
    if (!lineEl || !lineId || !(dirPrintPayloadByKey instanceof Map)) return null;

    const lineSuffixHtml = toText(lineEl.querySelector?.('[data-line-suffix-row]')?.outerHTML || '');
    const stationInfoHtml = toText(lineEl.querySelector?.('[data-station-info]')?.outerHTML || '');
    const lineHeaderHtml = toText(lineEl.querySelector?.('.panel-line-header')?.outerHTML || '');
    const stationName = toText(lineEl?.getAttribute?.('data-station-name') || '');
    const dirs = [];
    const dirEls = Array.from(lineEl.querySelectorAll?.('[data-dir-toggle][data-dir-key]') || []);

    for (const dirEl of dirEls) {
        const dirKey = toText(dirEl.getAttribute?.('data-dir-key'));
        const lineDirKey = makeLineDirKey(lineId, dirKey);
        const payload = dirPrintPayloadByKey.get(lineDirKey);
        if (!payload) continue;
        const nextPayload = {
            ...payload,
            stationName,
            lineId,
            lineHeaderHtml,
            lineSuffixHtml,
            stationInfoHtml
        };
        dirs.push(nextPayload);
    }

    return {
        dirs,
        lineHeaderHtml,
        lineId,
        lineSuffixHtml,
        stationInfoHtml
    };
};

export const createPanelPrintRequestController = ({
    body,
    dirPrintPayloadByKey,
    makeLineDirKey,
    printAllEventName,
    toText = defaultToText,
    getStationName = () => '',
    getServiceDay = () => '',
    getTimetableViewMode = () => 'list',
    dispatchEvent = (event) => globalThis.window?.dispatchEvent?.(event),
    createCustomEvent = (name, init) => new CustomEvent(name, init)
} = {}) => {
    const findLineEl = (lineId) => {
        const targetId = toText(lineId);
        if (!targetId) return null;
        return Array.from(body?.querySelectorAll?.('[data-line-id]') || [])
            .find((el) => toText(el.getAttribute?.('data-line-id')) === targetId) || null;
    };

    const collectForLine = (lineId) => collectLinePrintPayloads({
        lineEl: findLineEl(lineId),
        lineId: toText(lineId),
        dirPrintPayloadByKey,
        makeLineDirKey,
        toText
    });

    const requestLineTimetableImage = (lineId) => {
        const payload = collectForLine(lineId);
        if (!payload?.dirs?.length) return false;
        try {
            dispatchEvent(createCustomEvent('__TokyoRailPrintLineTimetableImageRequested', {
                detail: payload
            }));
            return true;
        } catch {
            return false;
        }
    };

    const requestDirectionTimetable = (lineId) => requestLineTimetableImage(lineId);

    const collectAllDirectionPrintPayloads = () => {
        const out = [];
        const lineEls = Array.from(body?.querySelectorAll?.('[data-line-id]') || []);
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute?.('data-line-id'));
            if (!lineId) continue;
            const linePayload = collectLinePrintPayloads({
                lineEl,
                lineId,
                dirPrintPayloadByKey,
                makeLineDirKey,
                toText
            });
            if (!linePayload?.dirs?.length) continue;
            out.push(...linePayload.dirs);
        }
        return out;
    };

    const requestAllTimetables = () => {
        const pages = collectAllDirectionPrintPayloads();
        if (!pages.length) return false;
        try {
            dispatchEvent(createCustomEvent(printAllEventName, {
                detail: {
                    stationName: toText(getStationName()),
                    serviceDay: toText(getServiceDay()),
                    timetableViewMode: getTimetableViewMode(),
                    pages
                }
            }));
            return true;
        } catch {
            return false;
        }
    };

    return {
        collectAllDirectionPrintPayloads,
        requestAllTimetables,
        requestDirectionTimetable,
        requestLineTimetableImage
    };
};

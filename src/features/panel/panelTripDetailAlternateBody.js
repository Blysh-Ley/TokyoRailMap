import { getPairMapValue } from '../../domain/alternateLineMembership.js';

const defaultToText = (value) => String(value ?? '').trim();

const readMapValue = (map, key) => {
    if (!map || typeof map.get !== 'function') return '';
    return defaultToText(map.get(defaultToText(key)));
};

const resolveLineDescriptor = ({
    buildLineDescriptor = () => null,
    getLineMeta = () => null,
    lineId = '',
    toText = defaultToText
} = {}) => {
    const id = toText(lineId);
    if (!id) return null;
    const descriptor = buildLineDescriptor(id);
    if (descriptor) return descriptor;
    const meta = getLineMeta(id) || null;
    if (!meta) return null;
    return {
        lineId: id,
        text: toText(meta.name || id),
        color: toText(meta.color || '')
    };
};

export const resolvePanelTripDetailAlternateBodyStop = ({
    alternateLineMembership = null,
    getLineMeta = () => null,
    sourceLineId = '',
    stationId = '',
    stationName = '',
    stationsIndex = null,
    toText = defaultToText
} = {}) => {
    const rawStationId = toText(stationId);
    const rawLineId = toText(sourceLineId);
    const alternateStationId = getPairMapValue(
        alternateLineMembership?.alternateStationIdByLineStationId,
        rawLineId,
        rawStationId
    );
    const alternateLineId = getPairMapValue(
        alternateLineMembership?.alternateLineIdByLineStationId,
        rawLineId,
        rawStationId
    );

    const displayStationId = alternateStationId || rawStationId;
    const displayLineId = alternateLineId || rawLineId;
    const lineMeta = displayLineId ? (getLineMeta(displayLineId) || null) : null;

    return {
        displayLineColor: toText(lineMeta?.color || ''),
        displayLineId,
        displayStationCode: readMapValue(stationsIndex?.idToCode, displayStationId),
        displayStationId,
        displayStationName: readMapValue(stationsIndex?.idToNameZh, displayStationId) || toText(stationName || displayStationId),
        isAlternateBodyDisplay: !!(alternateStationId || alternateLineId)
    };
};

export const applyPanelTripDetailAlternateBodyDisplay = ({
    alternateLineMembership = null,
    getLineMeta = () => null,
    segments = [],
    stationsIndex = null,
    toText = defaultToText
} = {}) => (Array.isArray(segments) ? segments : []).map((segment) => {
    const sourceLineId = toText(segment?.lineId || segment?.r);
    return {
        ...segment,
        rows: (Array.isArray(segment?.rows) ? segment.rows : []).map((row) => ({
            ...row,
            ...resolvePanelTripDetailAlternateBodyStop({
                alternateLineMembership,
                getLineMeta,
                sourceLineId,
                stationId: row?.stationId,
                stationName: row?.stationName,
                stationsIndex,
                toText
            }),
            sourceLineId
        }))
    };
});

export const applyPanelTripDetailAlternateBodyTransferDisplay = async ({
    alternateLineMembership = null,
    getLineMeta = () => null,
    resolveTransferDisplayByStationIds = async () => new Map(),
    segments = [],
    stationsIndex = null,
    toText = defaultToText
} = {}) => {
    const segmentsWithBodyDisplay = applyPanelTripDetailAlternateBodyDisplay({
        alternateLineMembership,
        getLineMeta,
        segments,
        stationsIndex,
        toText
    });
    const stationIds = Array.from(new Set(
        segmentsWithBodyDisplay
            .flatMap((segment) => Array.isArray(segment?.rows) ? segment.rows : [])
            .map((row) => toText(row?.displayStationId || row?.stationId))
            .filter(Boolean)
    ));
    const transferDisplayByStationId = await resolveTransferDisplayByStationIds(stationIds);
    return segmentsWithBodyDisplay.map((segment) => ({
        ...segment,
        rows: (Array.isArray(segment?.rows) ? segment.rows : []).map((row) => ({
            ...row,
            transferDisplay: transferDisplayByStationId?.get?.(toText(row?.displayStationId || row?.stationId)) || null
        }))
    }));
};

export const renderPanelTripDetailAlternateBodyStopRow = ({
    lineId = '',
    renderPanelTripDetailStopRowHtml = () => '',
    renderTripDetailMomentHtml = () => '',
    stationsIndex = null,
    stop = null,
    toText = defaultToText,
    tripLineId = ''
} = {}) => {
    const s = stop || {};
    const stationId = toText(s.displayStationId || s.stationId);
    const transferDisplay = s?.transferDisplay || null;
    const transferRowCount = Math.max(1, Number(transferDisplay?.rowCount) || 1);
    const currentCls = s.isCurrent ? ' is-current' : '';
    return renderPanelTripDetailStopRowHtml({
        rowClass: `panel-trip-detail-row${s.isPast ? ' is-past' : ''}${currentCls}`,
        rowStyle: transferRowCount > 1 ? `min-height:${20 + (transferRowCount - 1) * 24}px;` : '',
        stationClass: `panel-trip-detail-station${currentCls}`,
        timeCellClass: 'panel-trip-detail-time panel-trip-detail-moment',
        timeHtml: renderTripDetailMomentHtml(s),
        transferDisplay,
        stationId,
        isCurrent: !!s.isCurrent,
        arrivalTime: toText(s.arr || s.dep || ''),
        stationCode: toText(s.displayStationCode || stationsIndex?.idToCode?.get?.(stationId) || ''),
        stationName: toText(s.displayStationName || s.stationName || stationId),
        lineId: toText(s.displayLineId || s.lineId || tripLineId || lineId),
        lineColor: toText(s.displayLineColor || s.lineColor || ''),
        muted: !!s.isPast
    });
};

export const splitPanelTripDetailAlternateBodySegmentsByDisplayLine = ({
    segments = [],
    toText = defaultToText
} = {}) => {
    const out = [];
    for (const segment of Array.isArray(segments) ? segments : []) {
        const rows = Array.isArray(segment?.rows) ? segment.rows : [];
        let currentLineId = '';
        let currentRows = [];

        const flush = () => {
            if (!currentRows.length) return;
            out.push({
                ...segment,
                displaySourceLineId: toText(segment?.lineId || segment?.r),
                lineId: currentLineId,
                rows: currentRows
            });
            currentRows = [];
        };

        for (const row of rows) {
            const displayLineId = toText(row?.displayLineId || segment?.lineId || segment?.r);
            if (currentRows.length && displayLineId !== currentLineId) {
                flush();
            }
            currentLineId = displayLineId;
            currentRows.push(row);
        }
        flush();
    }
    return out;
};

export const applyPanelTripDetailAlternateBodyDisplayToLanes = ({
    alternateLineMembership = null,
    buildLineDescriptor = () => null,
    getLineMeta = () => null,
    lanes = [],
    stationsIndex = null,
    toText = defaultToText
} = {}) => (Array.isArray(lanes) ? lanes : []).map((lane) => {
    const sourceLineId = toText(lane?.lineId || lane?.descriptor?.lineId);
    const rows = (Array.isArray(lane?.rows) ? lane.rows : []).map((row) => {
        const rowSourceLineId = toText(row?.sourceLineId || row?.lineId || sourceLineId);
        const display = resolvePanelTripDetailAlternateBodyStop({
            alternateLineMembership,
            getLineMeta,
            sourceLineId: rowSourceLineId,
            stationId: row?.stationId,
            stationName: row?.stationName,
            stationsIndex,
            toText
        });
        const displayLineDescriptor = resolveLineDescriptor({
            buildLineDescriptor,
            getLineMeta,
            lineId: display.displayLineId,
            toText
        }) || lane?.descriptor || null;
        return {
            ...row,
            ...display,
            displayLineDescriptor,
            sourceLineId: rowSourceLineId
        };
    });
    const firstDisplayLineId = toText(rows.find((row) => toText(row?.displayLineId))?.displayLineId);
    const descriptor = firstDisplayLineId && firstDisplayLineId !== sourceLineId
        ? (resolveLineDescriptor({
            buildLineDescriptor,
            getLineMeta,
            lineId: firstDisplayLineId,
            toText
        }) || lane?.descriptor || null)
        : lane?.descriptor;
    return {
        ...lane,
        descriptor,
        rows
    };
});

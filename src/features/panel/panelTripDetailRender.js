import { createStationCodeBadgeElement } from '../../lib/line-icons.js';
import {
    appendPanelStationJumpClass,
    normalizePanelStationJumpTime
} from './panelStationJump.js';



// panelTripDetailViewModel.js
const defaultToText_panelTripDetailViewModel = (value) => String(value ?? '').trim();

const toArray_panelTripDetailViewModel = (value) => (Array.isArray(value) ? value : (value ? [value] : []));

export const getTripDetailStationAKey = (stationId, toText = defaultToText_panelTripDetailViewModel) => {
    const s = toText(stationId);
    if (!s) return '';
    const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
};

export const matchesTripDetailEndpointStop = ({
    allowAKeyFallback = true,
    endpointAKeys,
    endpointIds,
    stationAKey,
    stationId,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const sid = toText(stationId);
    if (sid && endpointIds?.has?.(sid)) return true;
    const aKey = toText(stationAKey);
    return !!allowAKeyFallback && !!aKey && !!endpointAKeys?.has?.(aKey);
};

const findTripDetailCurrentStationIndex_panelTripDetailViewModel = ({
    currentStationId,
    getStationAKey = null,
    isEligible = () => true,
    rows,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    const sid = toText(currentStationId);
    if (!sid) return -1;

    const exactIdx = list.findIndex((row) => {
        return isEligible(row) && toText(row?.stationId) === sid;
    });
    if (exactIdx >= 0 || typeof getStationAKey !== 'function') return exactIdx;

    const currentAKey = toText(getStationAKey(sid));
    if (!currentAKey) return -1;
    return list.findIndex((row) => {
        return isEligible(row) && toText(getStationAKey(row?.stationId)) === currentAKey;
    });
};

export const getTripDetailRefs = (trip, toText = defaultToText_panelTripDetailViewModel) => {
    const ptRefs = toArray_panelTripDetailViewModel(trip?.pt);
    const ntRefs = toArray_panelTripDetailViewModel(trip?.nt);
    return {
        ntRefIds: ntRefs.map((x) => toText(x)).filter(Boolean),
        ntRefs,
        ptRefIds: ptRefs.map((x) => toText(x)).filter(Boolean),
        ptRefs
    };
};

export const buildTripDetailEndpointContext = ({
    allowEndpointAKeyFallback = true,
    trip,
    getStationAKey = (id) => id,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const { ntRefIds, ntRefs, ptRefIds, ptRefs } = getTripDetailRefs(trip, toText);
    const hasPt = ptRefs.some((x) => !!toText(x));
    const hasNt = ntRefs.some((x) => !!toText(x));
    const dirRaw = toText(trip?.d);
    const isLoopDirection = /Loop/i.test(dirRaw);
    const hideThroughSegmentsForLoop = isLoopDirection && (hasPt || hasNt);
    const originIds = new Set(toArray_panelTripDetailViewModel(trip?.os).map((x) => toText(x)).filter(Boolean));
    const terminalIds = new Set(toArray_panelTripDetailViewModel(trip?.ds).map((x) => toText(x)).filter(Boolean));
    const originAKeys = new Set(Array.from(originIds).map((id) => getStationAKey(id)).filter(Boolean));
    const terminalAKeys = new Set(Array.from(terminalIds).map((id) => getStationAKey(id)).filter(Boolean));

    return {
        allowEndpointAKeyFallback: allowEndpointAKeyFallback !== false,
        dirRaw,
        hasNt,
        hasPt,
        hideThroughSegmentsForLoop,
        isLoopDirection,
        ntRefIds,
        ntRefs,
        originAKeys,
        originIds,
        ptRefIds,
        ptRefs,
        showOriginLabel: !!originIds.size,
        showTerminalLabel: !!terminalIds.size,
        terminalAKeys,
        terminalIds
    };
};

const mergeBoundaryRows_panelTripDetailViewModel = ({
    currFirst,
    prevLast,
    preferCurrentBase = false,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const base = preferCurrentBase ? currFirst : prevLast;
    return {
        ...base,
        arr: toText(prevLast?.arr) || toText(currFirst?.arr) || null,
        arrPlus: toText(prevLast?.arr) ? !!prevLast?.arrPlus : !!currFirst?.arrPlus,
        dep: toText(currFirst?.dep) || toText(prevLast?.dep) || null,
        depPlus: toText(currFirst?.dep) ? !!currFirst?.depPlus : !!prevLast?.depPlus,
        stationName: toText(base?.stationName) || toText((preferCurrentBase ? prevLast : currFirst)?.stationName)
    };
};

export const mergeTripDetailSegmentsAtBoundaries = ({
    getStationAKey = (id) => id,
    segments,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const out = (Array.isArray(segments) ? segments : []).map((segment) => ({
        ...segment,
        rows: Array.isArray(segment?.rows) ? segment.rows.slice() : []
    }));

    for (let i = 1; i < out.length; i += 1) {
        const prevSeg = out[i - 1] || null;
        const currSeg = out[i] || null;
        const prevRows = prevSeg?.rows || [];
        const currRows = currSeg?.rows || [];
        if (!prevRows.length || !currRows.length) continue;

        const prevLast = prevRows[prevRows.length - 1];
        const currFirst = currRows[0];
        const prevSid = toText(prevLast?.stationId);
        const currSid = toText(currFirst?.stationId);
        const sameById = prevSid && prevSid === currSid;
        const prevA = getStationAKey(prevSid);
        const currA = getStationAKey(currSid);
        const sameByA = prevA && currA && prevA === currA;
        if (!sameById && !sameByA) continue;

        if (prevSeg?.kind === 'pt') {
            currRows[0] = mergeBoundaryRows_panelTripDetailViewModel({
                currFirst,
                preferCurrentBase: true,
                prevLast,
                toText
            });
            prevRows.pop();
            continue;
        }

        currRows.shift();
        prevRows[prevRows.length - 1] = mergeBoundaryRows_panelTripDetailViewModel({
            currFirst,
            preferCurrentBase: false,
            prevLast,
            toText
        });
    }

    return out;
};

export const markRowsPastByStation = ({
    currentStationId,
    fallbackPast = false,
    getStationAKey = null,
    rows,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    const idx = findTripDetailCurrentStationIndex_panelTripDetailViewModel({
        currentStationId,
        getStationAKey,
        rows: list,
        toText
    });
    if (idx >= 0) {
        return list.map((s, rowIndex) => ({
            ...s,
            isPast: rowIndex < idx
        }));
    }
    return list.map((s) => ({
        ...s,
        isPast: !!fallbackPast
    }));
};

export const applyTripDetailPastState = ({
    currentStationId,
    getStationAKey = null,
    segments,
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const list = Array.isArray(segments) ? segments : [];
    const normalizedStops = list.flatMap((segment) => segment?.rows || []);
    const currentIdx = findTripDetailCurrentStationIndex_panelTripDetailViewModel({
        currentStationId,
        getStationAKey,
        isEligible: (row) => !!row?.isMain,
        rows: normalizedStops,
        toText
    });
    const stopsWithPast = normalizedStops.map((s, idx) => ({
        ...s,
        isPast: currentIdx >= 0 ? idx < currentIdx : false
    }));

    let cursor = 0;
    const segmentsWithPast = list.map((segment) => {
        const len = (segment?.rows || []).length;
        const rows = stopsWithPast.slice(cursor, cursor + len);
        cursor += len;
        return { ...segment, rows };
    });

    return {
        currentIdx,
        normalizedStops,
        segmentsWithPast,
        stopsWithPast
    };
};

export const buildTripDetailTitleViewModel = ({
    buildTerminalDisplayLabel = (names) => (Array.isArray(names) ? names.join(' / ') : ''),
    fallbackDestName = '',
    fallbackOriginName = '',
    originIds = [],
    resolveTrainTypeColorForTheme = (color) => color,
    stationNameById = new Map(),
    specialNames = [],
    terminalIds = [],
    toText = defaultToText_panelTripDetailViewModel,
    trainTypeColorIndex = new Map(),
    trainTypesIndex = new Map(),
    trip
} = {}) => {
    const titleOriginIds = Array.isArray(originIds) ? originIds.map((x) => toText(x)).filter(Boolean) : [];
    const titleOriginNames = Array.from(new Set(
        titleOriginIds.map((id) => toText(stationNameById?.get?.(id) || id)).filter(Boolean)
    ));
    const titleTerminalIds = Array.isArray(terminalIds) ? terminalIds.map((x) => toText(x)).filter(Boolean) : [];
    const titleTerminalNames = Array.from(new Set(
        titleTerminalIds.map((id) => toText(stationNameById?.get?.(id) || id)).filter(Boolean)
    ));
    const originName = buildTerminalDisplayLabel(titleOriginNames) || toText(fallbackOriginName);
    const destName = buildTerminalDisplayLabel(titleTerminalNames) || toText(fallbackDestName);
    const typeId = toText(trip?.y);
    const typeName = typeId ? toText(trainTypesIndex?.get?.(typeId) || typeId) : '';
    const typeColor = typeId ? toText(resolveTrainTypeColorForTheme(trainTypeColorIndex?.get?.(typeId))) : '';
    const tripNumber = toText(trip?.n) || toText(trip?.t) || toText(trip?.id);
    const specialTypeCodes = Array.from(new Set(
        (Array.isArray(specialNames) ? specialNames : [])
            .map((name) => {
                const text = toText(name);
                return text.split(/\s+/).filter(Boolean)[0] || text;
            })
            .map((value) => toText(value))
            .filter(Boolean)
    ));
    const metaParts = [];
    if (tripNumber) metaParts.push(`车次号 ${tripNumber}`);
    if (specialTypeCodes.length) metaParts.push(`特殊种别号 ${specialTypeCodes.join(' / ')}`);

    return {
        destName,
        metaText: metaParts.join(' · '),
        originName,
        routeText: `${originName || '未知始发'}→${destName || '未知终点'}`,
        specialTypeCodes,
        titlePrefix: `往 ${destName || '未知方向'}`.trim(),
        typeColor,
        typeId,
        typeName,
        tripNumber
    };
};

export const buildPanelTripDetailMobileHeaderViewModel = async ({
    trip,
    stationsIndex,
    trainTypesIndex,
    trainTypeColorIndex,
    resolveThroughServiceEndpointIds = async () => ({ originId: '', originIds: [], terminalIds: [] }),
    getStationIds = () => [],
    buildTerminalDisplayLabel,
    getTripDestName = () => '',
    resolveTrainTypeColorForTheme = (color) => color,
    collectTripSpecialNames = async () => [],
    toText = defaultToText_panelTripDetailViewModel
} = {}) => {
    const throughEndpoints = await resolveThroughServiceEndpointIds(trip);
    const originIds = Array.isArray(throughEndpoints?.originIds)
        ? throughEndpoints.originIds.map((value) => toText(value)).filter(Boolean)
        : [];
    const titleOriginIds = originIds.length
        ? originIds
        : [toText(throughEndpoints?.originId), ...getStationIds(trip?.os)].filter(Boolean);
    const terminalIds = Array.isArray(throughEndpoints?.terminalIds)
        ? throughEndpoints.terminalIds.map((value) => toText(value)).filter(Boolean)
        : [];
    const titleTerminalIds = terminalIds.length ? terminalIds : getStationIds(trip?.ds);
    const specialNames = await collectTripSpecialNames(trip);
    const fallbackOriginId = titleOriginIds[0] || toText(trip?.tt?.[0]?.s);
    const fallbackDestName = getTripDestName(trip, stationsIndex);
    const fallbackOriginName = fallbackOriginId
        ? toText(stationsIndex?.idToNameZh?.get?.(fallbackOriginId) || fallbackOriginId)
        : '';

    return buildTripDetailTitleViewModel({
        buildTerminalDisplayLabel,
        fallbackDestName,
        fallbackOriginName,
        originIds: titleOriginIds,
        resolveTrainTypeColorForTheme,
        stationNameById: stationsIndex?.idToNameZh,
        specialNames,
        terminalIds: titleTerminalIds,
        toText,
        trainTypeColorIndex,
        trainTypesIndex,
        trip
    });
};

// panelTripDetailTitleRenderer.js
const defaultToText_panelTripDetailTitleRenderer = (value) => String(value ?? '').trim();
const UNKNOWN_DESTINATION_LABEL_panelTripDetailTitleRenderer = '\u672a\u77e5\u65b9\u5411';
const TOWARD_PREFIX_panelTripDetailTitleRenderer = '\u5f80';

export const buildPanelTripDetailTitleHtml = async ({
    trip,
    stationsIndex,
    trainTypesIndex,
    trainTypeColorIndex,
    resolveThroughServiceEndpointIds = async () => ({ terminalIds: [] }),
    getStationIds = () => [],
    buildTerminalDisplayLabel = () => '',
    getTripDestName = () => '',
    resolveTrainTypeColorForTheme = (value) => value,
    collectTripSpecialNames = async () => [],
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText_panelTripDetailTitleRenderer
} = {}) => {
    const titleThroughEndpoints = await resolveThroughServiceEndpointIds(trip);
    const titleResolvedTerminalIds = Array.isArray(titleThroughEndpoints?.terminalIds)
        ? titleThroughEndpoints.terminalIds.map((value) => toText(value)).filter(Boolean)
        : [];
    const fallbackTitleTerminalIds = getStationIds(trip?.ds);
    const titleTerminalIds = titleResolvedTerminalIds.length ? titleResolvedTerminalIds : fallbackTitleTerminalIds;
    const titleTerminalNames = Array.from(new Set(
        titleTerminalIds.map((id) => toText(stationsIndex?.idToNameZh?.get?.(id) || id)).filter(Boolean)
    ));
    const destName = buildTerminalDisplayLabel(titleTerminalNames) || getTripDestName(trip, stationsIndex) || UNKNOWN_DESTINATION_LABEL_panelTripDetailTitleRenderer;
    const typeId = toText(trip?.y);
    const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
    const typeColor = typeId ? resolveTrainTypeColorForTheme(trainTypeColorIndex.get(typeId)) : '';
    const titlePrefix = `${TOWARD_PREFIX_panelTripDetailTitleRenderer} ${destName}`.trim();
    const safeTypeName = toText(typeName);
    const safeTypeColor = toText(typeColor);
    const titleSpecialNames = await collectTripSpecialNames(trip);
    const titleSpecialText = Array.from(new Set(
        (Array.isArray(titleSpecialNames) ? titleSpecialNames : [])
            .map((value) => toText(value))
            .filter(Boolean)
    )).join(' / ');
    const titleMainHtml = safeTypeName
        ? `${escapeHtml(titlePrefix)} <span class="panel-trip-detail-title-type"${safeTypeColor ? ` style="color:${escapeHtml(safeTypeColor)}"` : ''}>${escapeHtml(safeTypeName)}</span>`
        : escapeHtml(titlePrefix);
    const titleSpecialHtml = titleSpecialText
        ? `<div class="panel-trip-detail-title-special">${escapeHtml(titleSpecialText)}</div>`
        : '';
    return `<div class="panel-trip-detail-title-main">${titleMainHtml}</div>${titleSpecialHtml}`;
};

// panelTripDetailStationRenderer.js
const toText_panelTripDetailStationRenderer = (value) => String(value ?? '').trim();

const escapeHtml_panelTripDetailStationRenderer = (input) => String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getRouteIdFromStationId_panelTripDetailStationRenderer = (stationId) => {
    const id = toText_panelTripDetailStationRenderer(stationId);
    const parts = id.split('.').filter(Boolean);
    if (parts.length < 3) return '';
    return parts.slice(0, -1).join('.');
};

const renderStationCodeBadgeHtml_panelTripDetailStationRenderer = ({ stationCode = '', lineColor = '', routeId = '', muted = false } = {}) => {
    const code = toText_panelTripDetailStationRenderer(stationCode);
    if (!code) return '';

    try {
        const badge = createStationCodeBadgeElement({
            code,
            color: toText_panelTripDetailStationRenderer(lineColor),
            routeId: toText_panelTripDetailStationRenderer(routeId),
            muted
        });
        return badge?.outerHTML || '';
    } catch {
        return '';
    }
};

export const renderPanelTripDetailStationContentHtml = ({
    stationCode = '',
    stationName = '',
    stationId = '',
    lineColor = '',
    lineId = '',
    muted = false
} = {}) => {
    const name = toText_panelTripDetailStationRenderer(stationName || stationId);
    const badgeRouteId = getRouteIdFromStationId_panelTripDetailStationRenderer(stationId) || toText_panelTripDetailStationRenderer(lineId);
    const badgeHtml = renderStationCodeBadgeHtml_panelTripDetailStationRenderer({ stationCode, lineColor, routeId: badgeRouteId, muted });
    const badgeWrapHtml = badgeHtml
        ? `<span class="panel-trip-detail-station-badge" aria-hidden="true">${badgeHtml}</span>`
        : '';

    return `
        ${badgeWrapHtml}
        <span class="panel-dir-marquee panel-trip-detail-station-marquee" aria-label="${escapeHtml_panelTripDetailStationRenderer(name)}">
            <span class="panel-dir-marquee-inner panel-trip-detail-station-name">${escapeHtml_panelTripDetailStationRenderer(name)}</span>
        </span>
    `;
};

export const renderPanelTripDetailStationCellHtml = ({
    className = 'panel-trip-detail-station',
    style = '',
    dataStationId = '',
    arrivalTime = '',
    stationJumpEnabled = true,
    lineId = '',
    lineColor = '',
    stationCode = '',
    stationName = '',
    stationId = '',
    muted = false
} = {}) => {
    const safeStationId = toText_panelTripDetailStationRenderer(dataStationId || stationId);
    const safeArrivalTime = normalizePanelStationJumpTime(arrivalTime, { toText: toText_panelTripDetailStationRenderer });
    const safeClassName = stationJumpEnabled && safeStationId
        ? appendPanelStationJumpClass(className)
        : toText_panelTripDetailStationRenderer(className);
    const attrs = [
        `class="${escapeHtml_panelTripDetailStationRenderer(safeClassName)}"`,
        toText_panelTripDetailStationRenderer(style) ? `style="${escapeHtml_panelTripDetailStationRenderer(style)}"` : '',
        safeStationId ? `data-station-id="${escapeHtml_panelTripDetailStationRenderer(safeStationId)}"` : '',
        stationJumpEnabled && safeStationId ? 'data-panel-station-jump="1"' : '',
        stationJumpEnabled && safeStationId ? 'role="button"' : '',
        stationJumpEnabled && safeStationId ? 'tabindex="0"' : '',
        safeArrivalTime ? `data-panel-station-arrival-time="${escapeHtml_panelTripDetailStationRenderer(safeArrivalTime)}"` : '',
        toText_panelTripDetailStationRenderer(lineId) ? `data-line-id="${escapeHtml_panelTripDetailStationRenderer(lineId)}"` : '',
        toText_panelTripDetailStationRenderer(lineColor) ? `data-line-color="${escapeHtml_panelTripDetailStationRenderer(lineColor)}"` : ''
    ].filter(Boolean).join(' ');

    return `<div ${attrs}>${renderPanelTripDetailStationContentHtml({
        stationCode,
        stationName,
        stationId,
        lineColor,
        lineId,
        muted
    })}</div>`;
};

const MAX_PANEL_TRIP_DETAIL_TRANSFER_ITEMS_PER_ROW = 5;

export const renderPanelTripDetailTransferRowsHtml = (itemHtmls = [], {
    maxItemsPerRow = MAX_PANEL_TRIP_DETAIL_TRANSFER_ITEMS_PER_ROW
} = {}) => {
    const list = Array.isArray(itemHtmls) ? itemHtmls.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const perRow = Math.max(1, Number(maxItemsPerRow) || MAX_PANEL_TRIP_DETAIL_TRANSFER_ITEMS_PER_ROW);
    const rows = [];
    for (let start = 0; start < list.length; start += perRow) {
        rows.push(`<span class="panel-trip-detail-transfer-row">${list.slice(start, start + perRow).join('')}</span>`);
    }
    return rows.join('');
};

export const renderPanelTripDetailTransferCellHtml = ({
    className = 'panel-trip-detail-transfer',
    style = '',
    itemHtmls = [],
    popoverItemHtmls = null,
    rowCount = 1,
    popoverRowCount = 1,
    label = ''
} = {}) => {
    const items = Array.isArray(itemHtmls) ? itemHtmls.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const popoverItems = Array.isArray(popoverItemHtmls)
        ? popoverItemHtmls.map((value) => String(value || '').trim()).filter(Boolean)
        : items;
    const safeClass = toText_panelTripDetailStationRenderer(className);
    const safeStyle = toText_panelTripDetailStationRenderer(style);
    const attrs = [
        `class="${escapeHtml_panelTripDetailStationRenderer(safeClass)}"`,
        safeStyle ? `style="${escapeHtml_panelTripDetailStationRenderer(safeStyle)}"` : ''
    ].filter(Boolean).join(' ');
    if (!items.length && !popoverItems.length) return `<div ${attrs}></div>`;

    const mainRowsHtml = renderPanelTripDetailTransferRowsHtml(items);
    const popoverRowsHtml = renderPanelTripDetailTransferRowsHtml(popoverItems);
    const safeRowCount = Math.max(1, Number(rowCount) || 1);
    const safePopoverRowCount = Math.max(1, Number(popoverRowCount) || safeRowCount);
    const mainClass = safeRowCount > 1 ? 'panel-trip-detail-transfer-items is-multi-rows' : 'panel-trip-detail-transfer-items';
    const popoverClass = safePopoverRowCount > 1 ? 'panel-trip-detail-transfer-items is-multi-rows' : 'panel-trip-detail-transfer-items';
    const ariaLabel = escapeHtml_panelTripDetailStationRenderer(toText_panelTripDetailStationRenderer(label) || `换乘线路：${popoverItems.length}条`);
    return `
        <div ${attrs}>
            <span class="panel-trip-detail-transfer-shell" tabindex="0" aria-label="${ariaLabel}">
                <span class="${mainClass} panel-trip-detail-transfer-items-main">${mainRowsHtml}</span>
                <span class="panel-trip-detail-transfer-hover-panel" role="tooltip">
                    <span class="${popoverClass} panel-trip-detail-transfer-items-popover">${popoverRowsHtml}</span>
                </span>
            </span>
        </div>
    `;
};

export const renderPanelTripDetailStopRowHtml = ({
    rowClass = '',
    rowStyle = '',
    stationClass = '',
    arriveCellClass = '',
    departCellClass = '',
    timeCellClass = '',
    timeHtml = '',
    transferDisplay = null,
    arriveTextClass = '',
    departTextClass = '',
    stationId = '',
    stationCode = '',
    stationName = '',
    lineId = '',
    lineColor = '',
    muted = false,
    arrivalTime = '',
    arrivalLabelHtml = '',
    departLabelHtml = '',
    arrivalText = '',
    departureText = ''
} = {}) => {
    const arriveHtml = toText_panelTripDetailStationRenderer(arrivalText) && toText_panelTripDetailStationRenderer(arriveTextClass)
        ? `<span class="${escapeHtml_panelTripDetailStationRenderer(arriveTextClass)}">${escapeHtml_panelTripDetailStationRenderer(arrivalText)}</span>`
        : '';
    const departHtml = toText_panelTripDetailStationRenderer(departureText) && toText_panelTripDetailStationRenderer(departTextClass)
        ? `<span class="${escapeHtml_panelTripDetailStationRenderer(departTextClass)}">${escapeHtml_panelTripDetailStationRenderer(departureText)}</span>`
        : '';
    const hasSingleTimeCell = !!toText_panelTripDetailStationRenderer(timeCellClass);
    const timeCellHtml = hasSingleTimeCell
        ? `<div class="${escapeHtml_panelTripDetailStationRenderer(timeCellClass)}">${timeHtml}</div>`
        : `
            <div class="${escapeHtml_panelTripDetailStationRenderer(arriveCellClass)}">${arrivalLabelHtml || ''}${arriveHtml}</div>
            <div class="${escapeHtml_panelTripDetailStationRenderer(departCellClass)}">${departLabelHtml || ''}${departHtml}</div>
        `;

    return `
        <div class="${escapeHtml_panelTripDetailStationRenderer(rowClass)}"${toText_panelTripDetailStationRenderer(rowStyle) ? ` style="${escapeHtml_panelTripDetailStationRenderer(rowStyle)}"` : ''}>
            ${timeCellHtml}
            ${renderPanelTripDetailStationCellHtml({
                className: stationClass,
                dataStationId: stationId,
                arrivalTime: arrivalTime || arrivalText,
                lineId,
                lineColor,
                muted,
                stationCode,
                stationName,
                stationId
            })}
            ${renderPanelTripDetailTransferCellHtml(transferDisplay || {})}
        </div>
    `;
};

// panelTripDetailSegmentHelpers.js
const defaultToText_panelTripDetailSegmentHelpers = (value) => String(value ?? '').trim();

export const renderPanelTripDetailNoteRow = ({
    descriptor,
    typeName,
    typeColor,
    isPast,
    renderTimetableNoteRowHtml,
    toText = defaultToText_panelTripDetailSegmentHelpers
} = {}) => {
    if (!descriptor?.text) return '';
    const past = !!isPast;
    return renderTimetableNoteRowHtml({
        rowClass: past ? 'panel-trip-detail-note-row is-past' : 'panel-trip-detail-note-row',
        dotClass: 'panel-trip-detail-note-dot',
        lineClass: 'panel-trip-detail-note-line',
        typeClass: 'panel-trip-detail-note-type',
        lineText: descriptor.text,
        lineColor: past ? '#ccc' : toText(descriptor.color),
        dotColor: past ? '#ccc' : toText(descriptor.color),
        typeText: toText(typeName),
        typeColor: past ? '' : toText(typeColor)
    });
};

export const getPanelTripDetailSegmentFirstRow = (segment) => (
    Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[0] : null
);

export const getPanelTripDetailSegmentLastRow = (segment) => (
    Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[segment.rows.length - 1] : null
);

export const isPanelTripDetailBoundaryPast = (leftRow, rightRow) => {
    if (leftRow && rightRow) return !!(leftRow.isPast && rightRow.isPast);
    if (leftRow) return !!leftRow.isPast;
    if (rightRow) return !!rightRow.isPast;
    return false;
};

export const renderPanelTripDetailLoopMarkerRow = ({
    text,
    renderTimetablePlainNoteRowHtml,
    toText = defaultToText_panelTripDetailSegmentHelpers
} = {}) => {
    const label = toText(text);
    if (!label) return '';
    return renderTimetablePlainNoteRowHtml({
        rowClass: 'panel-trip-detail-note-row',
        lineClass: 'panel-trip-detail-note-line',
        text: label
    });
};

// panelTripDetailSegmentBlockBuilder.js
const defaultToText_panelTripDetailSegmentBlockBuilder = (value) => String(value ?? '').trim();

export const buildPanelTripDetailSegmentBlocks = ({
    segmentsWithPast,
    throughCategoryLabel = '',
    throughCategoryColor = '',
    currentLineDesc = null,
    buildLineDescriptor = () => null,
    isSameLineName = () => false,
    toText = defaultToText_panelTripDetailSegmentBlockBuilder
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

// panelTripDetailLinearRowsRenderer.js
const LOOP_MARKER_UP_panelTripDetailLinearRowsRenderer = '\u2191\u73af\u7ebf';
const LOOP_MARKER_DOWN_panelTripDetailLinearRowsRenderer = '\u2193\u73af\u7ebf';

export const renderPanelTripDetailLinearRows = ({
    segmentBlocks,
    hideThroughSegmentsForLoop = false,
    renderPanelTripDetailLoopMarkerRow = () => '',
    getPanelTripDetailSegmentFirstRow = () => null,
    getPanelTripDetailSegmentLastRow = () => null,
    isPanelTripDetailBoundaryPast = () => false,
    renderPanelTripDetailNoteRow = () => '',
    renderStopRow = () => ''
} = {}) => {
    const blocks = Array.isArray(segmentBlocks) ? segmentBlocks : [];
    let rowsHtml = '';

    if (hideThroughSegmentsForLoop) {
        rowsHtml += renderPanelTripDetailLoopMarkerRow({
            text: LOOP_MARKER_UP_panelTripDetailLinearRowsRenderer
        });
    }

    for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const prevBlock = i > 0 ? blocks[i - 1] : null;
        const firstSeg = block?.segments?.[0] || null;
        const prevLastSeg = prevBlock?.segments?.[prevBlock.segments.length - 1] || null;
        const prevLastRow = getPanelTripDetailSegmentLastRow(prevLastSeg);
        const firstRow = getPanelTripDetailSegmentFirstRow(firstSeg);

        rowsHtml += renderPanelTripDetailNoteRow({
            descriptor: block?.descriptor,
            typeName: block?.typeName,
            typeColor: block?.typeColor,
            isPast: isPanelTripDetailBoundaryPast(prevLastRow, firstRow)
        });

        for (const seg of Array.isArray(block?.segments) ? block.segments : []) {
            const segLineColor = String(block?.descriptor?.color || seg?.typeColor || '').trim();
            rowsHtml += (Array.isArray(seg?.rows) ? seg.rows : [])
                .map((row) => renderStopRow({ ...(row || {}), lineColor: segLineColor }))
                .join('');
        }
    }

    if (hideThroughSegmentsForLoop) {
        rowsHtml += renderPanelTripDetailLoopMarkerRow({
            text: LOOP_MARKER_DOWN_panelTripDetailLinearRowsRenderer
        });
    }

    return rowsHtml;
};

// panelTripDetailLayoutShell.js
const DEFAULT_TABLE_CLASS_panelTripDetailLayoutShell = 'panel-trip-detail-table';
const BRANCH_TABLE_CLASS_panelTripDetailLayoutShell = 'panel-trip-detail-table is-branch-grid';
const DEFAULT_SPACER_HTML_panelTripDetailLayoutShell = '<div class="panel-trip-detail-spacer"></div>';
const STATION_LABEL_panelTripDetailLayoutShell = '\u8f66\u7ad9';
const TIME_LABEL_panelTripDetailLayoutShell = '\u65f6\u523b';

export const buildPanelTripDetailLayoutShell = ({
    useBranchGridLayout = false,
    branchCount = 0
} = {}) => {
    if (!useBranchGridLayout) {
        return {
            tripDetailTableClass: DEFAULT_TABLE_CLASS_panelTripDetailLayoutShell,
            tripDetailTableInlineStyle: '',
            spacerHtml: DEFAULT_SPACER_HTML_panelTripDetailLayoutShell,
            headerHtml: `
                <div class="panel-trip-detail-head">
                    <div class="panel-trip-detail-time panel-trip-detail-moment">${TIME_LABEL_panelTripDetailLayoutShell}</div>
                    <div class="panel-trip-detail-station">${STATION_LABEL_panelTripDetailLayoutShell}</div>
                    <div class="panel-trip-detail-transfer">${'\u6362\u4e58'}</div>
                </div>
            `,
            totalCols: 0,
            primaryTimeColStart: 0,
            firstBranchMarkerCol: 0,
            transferColStart: 0,
            stationColStart: 0
        };
    }

    const safeBranchCount = Math.max(0, Number(branchCount) || 0);
    const totalCols = 2 * safeBranchCount + 2;
    const primaryTimeColStart = 1;
    const firstBranchMarkerCol = safeBranchCount >= 2 ? 3 : 0;
    const stationColStart = Math.max(1, totalCols - 1);
    const transferColStart = totalCols;
    let branchHeadHtml = '';
    for (let i = 0; i < safeBranchCount; i += 1) {
        const colStart = 1 + 2 * i;
        branchHeadHtml += `
            <div class="panel-trip-detail-head-cell panel-trip-detail-time panel-trip-detail-moment" style="grid-column:${colStart} / span 2;">${TIME_LABEL_panelTripDetailLayoutShell}</div>
        `;
    }

    return {
        tripDetailTableClass: BRANCH_TABLE_CLASS_panelTripDetailLayoutShell,
        tripDetailTableInlineStyle: ` style="--panel-trip-detail-cols:${totalCols};--panel-trip-detail-branch-count:${safeBranchCount};"`,
        spacerHtml: `<div class="panel-trip-detail-spacer panel-trip-detail-grid-spacer" style="grid-column:1 / span ${totalCols};"></div>`,
        headerHtml: `
            ${branchHeadHtml}
            <div class="panel-trip-detail-head-cell panel-trip-detail-station" style="grid-column:${stationColStart};">${STATION_LABEL_panelTripDetailLayoutShell}</div>
            <div class="panel-trip-detail-head-cell panel-trip-detail-transfer" style="grid-column:${transferColStart};">${'\u6362\u4e58'}</div>
        `,
        totalCols,
        primaryTimeColStart,
        firstBranchMarkerCol,
        transferColStart,
        stationColStart
    };
};

// panelTripDetailGridHelpers.js
const defaultToText_panelTripDetailGridHelpers = (value) => String(value ?? '').trim();

export const renderPanelTripDetailGridNoteCell = ({
    descriptor,
    typeName,
    typeColor,
    isPast,
    colStart,
    colSpan = 3,
    renderTimetableNoteRowHtml = null,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText_panelTripDetailGridHelpers
} = {}) => {
    if (!descriptor?.text) return '';
    const past = !!isPast;
    const lineColor = past ? '#ccc' : toText(descriptor?.color);
    const dotColor = past ? '#ccc' : toText(descriptor?.color);
    const safeTypeName = toText(typeName);
    const safeTypeColor = past ? '' : toText(typeColor);
    const noteCls = `panel-trip-detail-note-row panel-trip-detail-grid-note${past ? ' is-past' : ''}`;
    const col = Number(colStart) || 1;
    const span = Math.max(1, Number(colSpan) || 3);
    if (typeof renderTimetableNoteRowHtml === 'function') {
        return renderTimetableNoteRowHtml({
            rowClass: noteCls,
            rowStyle: `grid-column:${col} / span ${span};`,
            dotClass: 'panel-trip-detail-note-dot',
            lineClass: 'panel-trip-detail-note-line',
            typeClass: 'panel-trip-detail-note-type',
            lineText: toText(descriptor?.text),
            lineColor,
            dotColor,
            typeText: safeTypeName,
            typeColor: safeTypeColor
        });
    }
    return `
        <div class="${noteCls}" style="grid-column:${col} / span ${span};">
            <span class="panel-trip-detail-note-dot"${dotColor ? ` style="background:${escapeHtml(dotColor)}"` : ''}></span>
            <span class="panel-trip-detail-note-line"${lineColor ? ` style="color:${escapeHtml(lineColor)}"` : ''}>${escapeHtml(toText(descriptor?.text))}</span>
            ${safeTypeName ? `<span class="panel-trip-detail-note-type"${safeTypeColor ? ` style="color:${escapeHtml(safeTypeColor)}"` : ''}>${escapeHtml(safeTypeName)}</span>` : ''}
        </div>
    `;
};

export const renderPanelTripDetailGridStopCellsSharedStation = ({
    stop,
    timeColStart,
    stationColStart = 1,
    transferColStart = 0,
    transferDisplay = null,
    lineColor,
    rowMarkerCol = 0,
    rowMarkerText = '',
    stationCode = '',
    stationName = '',
    lineId = '',
    renderPanelTripDetailStationCellHtml,
    renderTripDetailMomentHtml,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText_panelTripDetailGridHelpers
} = {}) => {
    const s = stop || {};
    const timeCol = Math.max(1, Number(timeColStart) || 1);
    const stationCol = Math.max(1, Number(stationColStart) || 1);
    const stationId = toText(s.displayStationId || s.stationId);
    const pastCls = s.isPast ? ' is-past' : '';
    const safeLineColor = toText(s.displayLineColor || lineColor);
    const markerCol = Number(rowMarkerCol) || 0;
    const markerText = toText(rowMarkerText);
    const transferCol = Math.max(0, Number(transferColStart) || 0);
    const stationHtml = renderPanelTripDetailStationCellHtml({
        className: `panel-trip-detail-station panel-trip-detail-grid-cell${pastCls}`,
        style: `grid-column:${stationCol};`,
        dataStationId: stationId,
        arrivalTime: toText(s.arr || s.dep || ''),
        lineId: toText(s.displayLineId || s.lineId || lineId),
        lineColor: safeLineColor,
        muted: !!s.isPast,
        stationCode: toText(stationCode),
        stationName: toText(stationName || s.displayStationName || s.stationName || stationId),
        stationId
    });
    const timeHtml = `<div class="panel-trip-detail-time panel-trip-detail-moment panel-trip-detail-grid-cell${pastCls}" style="grid-column:${timeCol} / span 2;">${renderTripDetailMomentHtml(s)}</div>`;
    const cells = [
        { col: stationCol, html: stationHtml },
        { col: timeCol, html: timeHtml }
    ];
    if (transferCol > 0) {
        cells.push({
            col: transferCol,
            html: renderPanelTripDetailTransferCellHtml({
                className: `panel-trip-detail-transfer panel-trip-detail-grid-cell${pastCls}`,
                style: `grid-column:${transferCol};`,
                ...(transferDisplay || {})
            })
        });
    }
    if (markerCol > 0 && markerText) {
        const markerHtml = `<div class="panel-trip-detail-grid-break-marker panel-trip-detail-grid-flow-marker${pastCls}" style="grid-column:${markerCol};">${escapeHtml(markerText)}</div>`;
        cells.push({ col: markerCol, html: markerHtml });
    }
    cells.sort((a, b) => a.col - b.col);
    return cells.map((value) => value.html).join('');
};

export const renderPanelTripDetailGridMarkerCell = ({
    text,
    col,
    isPast = false,
    className = '',
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText_panelTripDetailGridHelpers
} = {}) => {
    const safeText = toText(text);
    if (!safeText) return '';
    const markerCol = Math.max(1, Number(col) || 1);
    const cls = `panel-trip-detail-grid-break-marker${isPast ? ' is-past' : ''}${className ? ` ${className}` : ''}`;
    return `<div class="${cls}" style="grid-column:${markerCol};">${escapeHtml(safeText)}</div>`;
};

// panelTripDetailGridLaneBlockRenderer.js
const defaultToText_panelTripDetailGridLaneBlockRenderer = (value) => String(value ?? '').trim();

export const renderPanelTripDetailGridLaneBlock = ({
    descriptor,
    typeName,
    typeColor,
    rows,
    timeColStart,
    stationColStart = 1,
    transferColStart = 0,
    totalCols,
    lineId = '',
    lineColor = '',
    flowMarkerCol = 0,
    rowMarkerText = '',
    resolveStationCode = () => '',
    renderPanelTripDetailStationCellHtml,
    renderTimetableNoteRowHtml = null,
    renderTripDetailMomentHtml,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText_panelTripDetailGridLaneBlockRenderer
} = {}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const isPast = safeRows.length ? !!safeRows[0]?.isPast : false;
    let html = renderPanelTripDetailGridNoteCell({
        descriptor,
        typeName,
        typeColor,
        isPast,
        colStart: 1,
        colSpan: totalCols,
        renderTimetableNoteRowHtml,
        escapeHtml,
        toText
    });

    const safeLineColor = toText(lineColor);
    const safeLineId = toText(lineId || descriptor?.lineId);
    for (const row of safeRows) {
        const stationId = toText(row?.displayStationId || row?.stationId);
        html += renderPanelTripDetailGridStopCellsSharedStation({
            stop: { ...(row || {}), lineColor: safeLineColor, lineId: toText(row?.lineId || safeLineId) },
            timeColStart,
            stationColStart,
            transferColStart,
            transferDisplay: row?.transferDisplay || null,
            lineColor: safeLineColor,
            lineId: safeLineId,
            rowMarkerCol: flowMarkerCol,
            rowMarkerText,
            stationCode: toText(row?.displayStationCode || resolveStationCode(stationId)),
            stationName: toText(row?.displayStationName || row?.stationName || stationId),
            renderPanelTripDetailStationCellHtml,
            renderTripDetailMomentHtml,
            escapeHtml,
            toText
        });
    }

    return html;
};

// panelTripDetailBranchBreakRowRenderer.js
const defaultToText_panelTripDetailBranchBreakRowRenderer = (value) => String(value ?? '').trim();

const BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer = 'split';
const SPLIT_MARKER_LEFT_panelTripDetailBranchBreakRowRenderer = '\u2523';
const MERGE_MARKER_LEFT_panelTripDetailBranchBreakRowRenderer = '\u2523';
const SPLIT_MARKER_RIGHT_panelTripDetailBranchBreakRowRenderer = '\u2513';
const MERGE_MARKER_RIGHT_panelTripDetailBranchBreakRowRenderer = '\u251b';
const SPLIT_LABEL_panelTripDetailBranchBreakRowRenderer = '\u89e3\u7f16';
const MERGE_LABEL_panelTripDetailBranchBreakRowRenderer = '\u5e76\u7ed3';
const SPLIT_STATION_SUFFIX_panelTripDetailBranchBreakRowRenderer = '\u7ad9\u89e3\u7f16';
const MERGE_STATION_SUFFIX_panelTripDetailBranchBreakRowRenderer = '\u7ad9\u5e76\u7ed3';
const SPLIT_STATION_FALLBACK_panelTripDetailBranchBreakRowRenderer = '\u89e3\u7f16\u7ad9';
const MERGE_STATION_FALLBACK_panelTripDetailBranchBreakRowRenderer = '\u5e76\u7ed3\u7ad9';

export const renderPanelTripDetailBranchBreakRow = ({
    branchMode,
    breakStop,
    breakIsPast = false,
    totalCols,
    primaryTimeColStart,
    stationColStart = 1,
    firstBranchMarkerCol = 0,
    lineId = '',
    lineColor = '',
    stationCode = '',
    stationName = '',
    buildTimetableStationText,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml,
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText_panelTripDetailBranchBreakRowRenderer
} = {}) => {
    const safeBranchMode = toText(branchMode) === BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer ? BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer : 'merge';
    const breakStationId = toText(breakStop?.stationId || '');
    const pastCls = breakIsPast ? ' is-past' : '';
    const safeStationCode = toText(stationCode);
    const safeStationName = toText(stationName || breakStop?.stationName || breakStationId);
    const rowStart = `<div class="panel-trip-detail-grid-break-row${pastCls}" style="grid-column:1 / span ${totalCols}; --panel-trip-detail-cols:${totalCols};">`;
    const rowEnd = '</div>';
    const markerLeft = renderPanelTripDetailGridMarkerCell({
        text: safeBranchMode === BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer ? SPLIT_MARKER_LEFT_panelTripDetailBranchBreakRowRenderer : MERGE_MARKER_LEFT_panelTripDetailBranchBreakRowRenderer,
        col: primaryTimeColStart,
        isPast: breakIsPast,
        escapeHtml,
        toText
    });
    const markerCenter = renderPanelTripDetailGridMarkerCell({
        text: safeBranchMode === BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer ? SPLIT_LABEL_panelTripDetailBranchBreakRowRenderer : MERGE_LABEL_panelTripDetailBranchBreakRowRenderer,
        col: Number(primaryTimeColStart) + 1,
        isPast: breakIsPast,
        escapeHtml,
        toText
    });
    const markerRight = firstBranchMarkerCol
        ? renderPanelTripDetailGridMarkerCell({
            text: safeBranchMode === BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer ? SPLIT_MARKER_RIGHT_panelTripDetailBranchBreakRowRenderer : MERGE_MARKER_RIGHT_panelTripDetailBranchBreakRowRenderer,
            col: firstBranchMarkerCol,
            isPast: breakIsPast,
            escapeHtml,
            toText
        })
        : '';

    const breakStationText = breakStationId
        ? `${buildTimetableStationText({
            stationCode: safeStationCode,
            stationName: safeStationName,
            stationId: breakStationId
        })}${safeBranchMode === BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer ? SPLIT_STATION_SUFFIX_panelTripDetailBranchBreakRowRenderer : MERGE_STATION_SUFFIX_panelTripDetailBranchBreakRowRenderer}`
        : (safeBranchMode === BRANCH_SPLIT_panelTripDetailBranchBreakRowRenderer ? SPLIT_STATION_FALLBACK_panelTripDetailBranchBreakRowRenderer : MERGE_STATION_FALLBACK_panelTripDetailBranchBreakRowRenderer);

    const breakStationHtml = renderPanelTripDetailStationCellHtml({
        className: `panel-trip-detail-station panel-trip-detail-grid-cell${pastCls}`,
        style: `grid-column:${Math.max(1, Number(stationColStart) || 1)};`,
        lineId: toText(lineId),
        lineColor: toText(lineColor),
        muted: breakIsPast,
        stationCode: breakStationId ? safeStationCode : '',
        stationName: breakStationText.replace(/^\S+\s+/, ''),
        stationId: breakStationId
    });

    return `${rowStart}${breakStationHtml}${markerLeft}${markerCenter}${markerRight}${rowEnd}`;
};

// panelTripDetailBranchGridRenderer.js
const defaultToText_panelTripDetailBranchGridRenderer = (value) => String(value ?? '').trim();

export const renderPanelTripDetailBranchGridRows = ({
    branchMode = '',
    buildTimetableStationText,
    escapeHtml = defaultToText_panelTripDetailBranchGridRenderer,
    firstBranchMarkerCol = 0,
    mainDescriptor = null,
    mainRows = [],
    markRowsPastByCurrentStation = (rows) => rows,
    primaryLane = null,
    primaryTimeColStart = 0,
    stationColStart = 1,
    transferColStart = 0,
    renderPanelTripDetailBranchBreakRow,
    renderPanelTripDetailGridLaneBlock,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml,
    renderTimetableNoteRowHtml = null,
    renderTripDetailMomentHtml,
    resolveStationCode = () => '',
    secondaryLanes = [],
    toText = defaultToText_panelTripDetailBranchGridRenderer,
    totalCols = 0,
    typeColor = '',
    typeName = ''
} = {}) => {
    const renderMainBlock = () => {
        const mainLineColor = toText(mainDescriptor?.color || typeColor || '');
        return renderPanelTripDetailGridLaneBlock({
            descriptor: mainDescriptor,
            typeName,
            typeColor,
            rows: mainRows,
            timeColStart: primaryTimeColStart,
            stationColStart,
            transferColStart,
            totalCols,
            lineId: toText(mainDescriptor?.lineId),
            lineColor: mainLineColor,
            resolveStationCode,
            renderPanelTripDetailStationCellHtml,
            renderTimetableNoteRowHtml,
            renderTripDetailMomentHtml,
            escapeHtml,
            toText
        });
    };

    const renderLaneBlockAt = (lane, timeColStart, flowMarkerCol = 0, fallbackPast = false) => {
        if (!lane) return '';
        const laneBaseRows = Array.isArray(lane?.rows) ? lane.rows : [];
        const laneRows = markRowsPastByCurrentStation(laneBaseRows, fallbackPast);
        const laneLineColor = toText(lane?.descriptor?.color || lane?.typeColor || '');
        return renderPanelTripDetailGridLaneBlock({
            descriptor: lane.descriptor,
            typeName: lane.typeName,
            typeColor: lane.typeColor,
            rows: laneRows,
            timeColStart,
            stationColStart,
            transferColStart,
            totalCols,
            lineId: toText(lane?.descriptor?.lineId || lane?.lineId),
            lineColor: laneLineColor,
            flowMarkerCol,
            rowMarkerText: flowMarkerCol > 0 ? '||' : '',
            resolveStationCode,
            renderPanelTripDetailStationCellHtml,
            renderTimetableNoteRowHtml,
            renderTripDetailMomentHtml,
            escapeHtml,
            toText
        });
    };

    const renderBreakRow = () => {
        const laneRowsForBreak = markRowsPastByCurrentStation(
            Array.isArray(primaryLane?.rows) ? primaryLane.rows : [],
            branchMode === 'split'
                ? !!mainRows[mainRows.length - 1]?.isPast
                : !!mainRows[0]?.isPast
        );
        const breakStop = branchMode === 'split'
            ? (laneRowsForBreak[0] || null)
            : (laneRowsForBreak[laneRowsForBreak.length - 1] || null);
        const breakIsPast = !!breakStop?.isPast;
        const breakStationId = toText(breakStop?.displayStationId || breakStop?.stationId || '');
        return renderPanelTripDetailBranchBreakRow({
            branchMode,
            breakStop,
            breakIsPast,
            totalCols,
            primaryTimeColStart,
            stationColStart,
            firstBranchMarkerCol,
            lineId: toText(breakStop?.displayLineId || primaryLane?.descriptor?.lineId || primaryLane?.lineId || mainDescriptor?.lineId),
            lineColor: toText(breakStop?.displayLineColor || primaryLane?.descriptor?.color || mainDescriptor?.color || typeColor || ''),
            stationCode: breakStationId ? toText(breakStop?.displayStationCode || resolveStationCode(breakStationId) || '') : '',
            stationName: toText(breakStop?.displayStationName || breakStop?.stationName || breakStationId),
            buildTimetableStationText,
            renderPanelTripDetailGridMarkerCell,
            renderPanelTripDetailStationCellHtml,
            escapeHtml,
            toText
        });
    };

    let rowsHtml = '';
    if (branchMode === 'merge') {
        const mergeFallbackPast = !!mainRows[0]?.isPast;
        rowsHtml += renderLaneBlockAt(primaryLane, primaryTimeColStart, 0, mergeFallbackPast);
        for (let i = 0; i < secondaryLanes.length; i += 1) {
            rowsHtml += renderLaneBlockAt(secondaryLanes[i], (firstBranchMarkerCol || primaryTimeColStart + 2) + i * 2, primaryTimeColStart, mergeFallbackPast);
        }
        rowsHtml += renderBreakRow();
        rowsHtml += renderMainBlock();
        return rowsHtml;
    }

    const splitFallbackPast = !!mainRows[mainRows.length - 1]?.isPast;
    rowsHtml += renderMainBlock();
    rowsHtml += renderBreakRow();
    rowsHtml += renderLaneBlockAt(primaryLane, primaryTimeColStart, firstBranchMarkerCol, splitFallbackPast);

    for (let i = 0; i < secondaryLanes.length; i += 1) {
        rowsHtml += renderLaneBlockAt(secondaryLanes[i], (firstBranchMarkerCol || primaryTimeColStart + 2) + i * 2, 0, splitFallbackPast);
    }

    return rowsHtml;
};

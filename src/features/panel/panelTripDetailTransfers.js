import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta } from '../../lib/line-icons.js';
import { preferredOrder } from '../../lib/special-condition.js';
import { THROUGH_SERVICE_CONFIGS_OBJECT, isSUStations as isStationSUStations } from '../../lib/throughServiceManager.js';
import {
    buildSupplementalTransferBadgeEntries,
    buildTransferBadgeEntriesByStationId,
    compactTransferBadgeEntries,
    sortTransferBadgeEntriesByCompany
} from '../../domain/transferBadgeDisplay.js';

const defaultToText = (value) => String(value ?? '').trim();

const formatPanelTripDetailLineIconHtml = (iconEl) => {
    if (typeof HTMLElement === 'undefined' || !(iconEl instanceof HTMLElement)) return '';
    iconEl.classList.add('panel-trip-detail-transfer-line-icon');
    iconEl.style.width = '20px';
    iconEl.style.height = '20px';
    iconEl.style.paddingTop = '1px';
    return iconEl.outerHTML;
};

const formatPanelTripDetailTransferStationBadgeHtml = (badgeEl) => {
    if (typeof HTMLElement === 'undefined' || !(badgeEl instanceof HTMLElement)) return '';
    badgeEl.classList.add('panel-trip-detail-transfer-line-icon');
    badgeEl.style.width = '20px';
    badgeEl.style.height = '20px';
    badgeEl.style.minWidth = '20px';
    badgeEl.style.minHeight = '20px';
    badgeEl.style.paddingTop = '1px';
    return badgeEl.outerHTML;
};

export const buildCompactTripDetailTransferItemHtmls = (entries, {
    htmlKey = 'html',
    toText = defaultToText
} = {}) => {
    return compactTransferBadgeEntries(
        (Array.isArray(entries) ? entries : [])
            .map((entry) => ({ ...entry, html: toText(entry?.[htmlKey] || entry?.html) }))
            .filter((entry) => entry.html),
        { toText }
    ).map((entry) => toText(entry?.html)).filter(Boolean);
};

const buildTripDetailTransferEntryFromLineMeta = (lineMeta, {
    escapeHtml = (value) => String(value ?? ''),
    stationCode = '',
    toText = defaultToText
} = {}) => {
    const routeId = toText(lineMeta?.id || lineMeta?.routeId);
    if (!routeId) return null;

    const company = toText(lineMeta?.company) || routeId.split('.')[0] || '';
    const lineColor = toText(lineMeta?.color) || '#888';
    const displayName = toText(lineMeta?.name) || routeId;
    const code = toText(lineMeta?.code);

    const safeStationCode = toText(stationCode);
    let lineIconHtml = '';
    let mutedLineIconHtml = '';
    if (safeStationCode) {
        const badgeEl = createStationCodeBadgeElement({ code: safeStationCode, color: lineColor, routeId });
        const mutedBadgeEl = createStationCodeBadgeElement({ code: safeStationCode, color: lineColor, routeId, muted: true });
        lineIconHtml = formatPanelTripDetailTransferStationBadgeHtml(badgeEl);
        mutedLineIconHtml = formatPanelTripDetailTransferStationBadgeHtml(mutedBadgeEl);
    } else if (code || lineColor) {
        const iconEl = createLineIconElement({ routeId, code, color: lineColor });
        const mutedIconEl = createLineIconElement({ routeId, code, color: lineColor, muted: true });
        lineIconHtml = formatPanelTripDetailLineIconHtml(iconEl);
        mutedLineIconHtml = formatPanelTripDetailLineIconHtml(mutedIconEl);
    }

    const html = `<span class="panel-trip-detail-transfer-item">${lineIconHtml}<span class="panel-trip-detail-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(displayName)}</span></span>`;
    const mutedHtml = `<span class="panel-trip-detail-transfer-item">${mutedLineIconHtml || lineIconHtml}<span class="panel-trip-detail-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(displayName)}</span></span>`;
    return {
        routeId,
        company,
        displayName,
        html,
        mutedHtml,
        iconCodes: [safeStationCode || code].filter(Boolean),
        iconColor: lineColor
    };
};

export const buildCompactTripDetailTransferLineItemHtmls = (lineMetas, {
    escapeHtml = (value) => String(value ?? ''),
    getStationCode = null,
    stationCode = '',
    toText = defaultToText
} = {}) => {
    const entries = [];
    const companyOrder = [];
    const groups = new Map();

    for (const lineMeta of Array.isArray(lineMetas) ? lineMetas : []) {
        const resolvedStationCode = typeof getStationCode === 'function'
            ? toText(getStationCode(lineMeta))
            : toText(stationCode);
        const entry = buildTripDetailTransferEntryFromLineMeta(lineMeta, {
            escapeHtml,
            stationCode: resolvedStationCode,
            toText
        });
        if (!entry?.html) continue;
        const company = toText(entry.company);
        if (!groups.has(company)) {
            groups.set(company, []);
            companyOrder.push(company);
        }
        groups.get(company).push(entry);
    }

    for (const entry of sortTransferBadgeEntriesByCompany(
        companyOrder.flatMap((company) => groups.get(company) || []),
        { preferredCompanyOrder: preferredOrder, toText }
    )) entries.push(entry);

    return buildCompactTripDetailTransferItemHtmls(entries, { toText });
};

const buildTripDetailTransferEntryHtml = (entry, {
    escapeHtml = (value) => String(value ?? ''),
    muted = false,
    toText = defaultToText
} = {}) => {
    const routeId = toText(entry?.routeId);
    if (!routeId) return '';
    const lineColor = toText(entry?.lineColor) || '#888';
    const displayName = toText(entry?.displayName) || routeId;
    const stationCode = toText(entry?.stationCode);
    const iconRouteId = toText(entry?.iconRouteId) || routeId;
    const iconCode = toText(entry?.iconCode);
    const iconColor = toText(entry?.iconColor) || lineColor;

    let lineIconHtml = '';
    if (stationCode) {
        const badgeEl = createStationCodeBadgeElement({
            code: stationCode,
            color: iconColor,
            routeId: iconRouteId,
            muted
        });
        lineIconHtml = formatPanelTripDetailTransferStationBadgeHtml(badgeEl);
    } else if (entry?.hasIconMeta && (iconCode || iconColor)) {
        const iconEl = createLineIconElement({
            routeId: iconRouteId,
            code: iconCode,
            color: iconColor,
            muted
        });
        lineIconHtml = formatPanelTripDetailLineIconHtml(iconEl);
    }

    return `<span class="panel-trip-detail-transfer-item">${lineIconHtml}<span class="panel-trip-detail-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(displayName)}</span></span>`;
};

const expandSupplementalTransferEntriesForPanel = (entries, {
    toText = defaultToText
} = {}) => {
    const out = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        const badgeSpecs = Array.isArray(entry?.badgeSpecs) ? entry.badgeSpecs : [];
        if (!badgeSpecs.length) {
            out.push(entry);
            continue;
        }
        for (const badge of badgeSpecs) {
            const iconCode = toText(badge?.code);
            if (!iconCode) continue;
            const routeId = toText(badge?.lineId) || toText(entry?.routeId);
            const iconColor = toText(badge?.color || entry?.iconColor || entry?.lineColor) || '#888';
            out.push({
                ...entry,
                routeId,
                rid: routeId,
                iconRouteId: routeId,
                iconCode,
                iconColor,
                iconCodes: [iconCode],
                hasIconMeta: true,
                badgeSpecs: null
            });
        }
    }
    return out;
};

export const buildTripDetailTransferDisplayByStationId = async ({
    currentLineId = '',
    escapeHtml = (value) => String(value ?? ''),
    getLineMeta = () => null,
    getStationCode = () => '',
    getStationGroupsIndex = async () => new Map(),
    stationIds = [],
    toText = defaultToText
} = {}) => {
    const ids = Array.from(new Set(
        (Array.isArray(stationIds) ? stationIds : [])
            .map((value) => toText(value))
            .filter(Boolean)
    ));
    if (!ids.length) return new Map();

    const out = new Map();

    const stationGroupsIndex = await getStationGroupsIndex();
    const transferBadgeEntriesByStationId = await buildTransferBadgeEntriesByStationId({
        currentLineId,
        getGroupIdsForStation: (stationId) => stationGroupsIndex?.get?.(stationId),
        getLineMeta,
        getStationCode: (stationId) => getStationCode(stationId),
        preferredCompanyOrder: preferredOrder,
        resolveIconMeta: (routeId, { color } = {}) => getResolvedRouteIconMeta(routeId, { color }),
        stationIds: ids,
        toText
    });

    for (const stationId of ids) {
        const transferBadgeDisplay = transferBadgeEntriesByStationId.get(stationId) || null;
        const ordinaryEntries = Array.isArray(transferBadgeDisplay?.entries) ? transferBadgeDisplay.entries : [];
        const supplementalStationRefs = [
            {
                stationId,
                displayStationIds: stationGroupsIndex?.get?.(stationId)
            },
            ...ordinaryEntries.map((entry) => ({
                stationId: toText(entry?.stationId),
                displayStationIds: entry?.displayStationIds
            }))
        ];
        const existingDisplayStationIds = ordinaryEntries.flatMap((entry) => (
            Array.isArray(entry?.displayStationIds) && entry.displayStationIds.length
                ? entry.displayStationIds
                : [entry?.stationId]
        ));
        const supplementalEntries = buildSupplementalTransferBadgeEntries({
            existingDisplayStationIds,
            serviceConfigsByKey: THROUGH_SERVICE_CONFIGS_OBJECT,
            stationRefs: supplementalStationRefs,
            stationServiceFlags: isStationSUStations(stationId),
            toText
        });
        const filtered = ordinaryEntries.slice();
        const seenDisplayNames = new Set(
            ordinaryEntries.map((entry) => toText(entry?.displayName)).filter(Boolean)
        );
        for (const entry of supplementalEntries) {
            const displayName = toText(entry?.displayName);
            if (!displayName || seenDisplayNames.has(displayName)) continue;
            seenDisplayNames.add(displayName);
            filtered.push(entry);
        }
        const panelEntries = expandSupplementalTransferEntriesForPanel(filtered, { toText });
        const sortedEntries = sortTransferBadgeEntriesByCompany(panelEntries, {
            preferredCompanyOrder: preferredOrder,
            toText
        });
        const compactEntries = compactTransferBadgeEntries(sortedEntries, { toText });
        const popoverItemHtmls = sortedEntries
            .map((entry) => buildTripDetailTransferEntryHtml(entry, { escapeHtml, toText }))
            .filter(Boolean);
        const itemHtmls = compactEntries
            .map((entry) => buildTripDetailTransferEntryHtml(entry, { escapeHtml, toText }))
            .filter(Boolean);
        const mutedItemHtmls = compactEntries
            .map((entry) => buildTripDetailTransferEntryHtml(entry, { escapeHtml, muted: true, toText }))
            .filter(Boolean);
        if (!itemHtmls.length && !popoverItemHtmls.length) continue;
        out.set(stationId, {
            itemHtmls,
            mutedItemHtmls,
            popoverItemHtmls,
            rowCount: Math.max(1, Math.ceil(itemHtmls.length / 5)),
            popoverRowCount: Math.max(1, Math.ceil(popoverItemHtmls.length / 5)),
            label: `换乘线路：${popoverItemHtmls.length}条`
        });
    }

    return out;
};

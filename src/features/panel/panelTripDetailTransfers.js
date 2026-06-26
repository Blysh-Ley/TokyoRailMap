import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta } from '../../lib/line-icons.js';
import { preferredOrder } from '../../lib/special-condition.js';

const defaultToText = (value) => String(value ?? '').trim();

const getRouteIdFromStationId = (stationIdRaw, toText = defaultToText) => {
    const stationId = toText(stationIdRaw);
    if (!stationId) return '';
    const parts = stationId.split('.').map((part) => toText(part)).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    return parts[0] || '';
};

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

const sortTripDetailTransferCompanies = (companyOrder, { toText = defaultToText } = {}) => {
    const preferredCompanyOrderIndex = new Map(
        preferredOrder.map((company, index) => [toText(company), index])
    );
    const originalIndex = new Map(
        (Array.isArray(companyOrder) ? companyOrder : []).map((company, index) => [toText(company), index])
    );
    return (Array.isArray(companyOrder) ? companyOrder.slice() : []).sort((a, b) => {
        const ac = toText(a);
        const bc = toText(b);
        const ai = preferredCompanyOrderIndex.has(ac)
            ? preferredCompanyOrderIndex.get(ac)
            : Number.POSITIVE_INFINITY;
        const bi = preferredCompanyOrderIndex.has(bc)
            ? preferredCompanyOrderIndex.get(bc)
            : Number.POSITIVE_INFINITY;
        if (ai !== bi) return ai - bi;
        const ao = originalIndex.has(ac) ? originalIndex.get(ac) : Number.POSITIVE_INFINITY;
        const bo = originalIndex.has(bc) ? originalIndex.get(bc) : Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return ac.localeCompare(bc, 'zh-Hans');
    });
};

const getTripDetailTransferDedupTargets = (entry, { toText = defaultToText } = {}) => {
    const company = toText(entry?.company);
    const codes = Array.isArray(entry?.iconCodes) ? entry.iconCodes.map((code) => toText(code)).filter(Boolean) : [];
    if (!company) return [];
    if (codes.length) {
        return codes.map((code) => ({ key: `code||${company}||${code}`, code }));
    }
    const iconColor = toText(entry?.iconColor).toLowerCase();
    if (!iconColor) return [];
    return [{ key: `color||${company}||${iconColor}`, code: '' }];
};

export const buildCompactTripDetailTransferItemHtmls = (entries, {
    htmlKey = 'html',
    toText = defaultToText
} = {}) => {
    const seenIconKeys = new Set();
    const compactHtmls = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        const html = toText(entry?.[htmlKey] || entry?.html);
        if (!html) continue;
        const targets = getTripDetailTransferDedupTargets(entry, { toText });
        if (!targets.length) {
            compactHtmls.push(html);
            continue;
        }

        let hasFreshIcon = false;
        for (const target of targets) {
            const key = toText(target?.key);
            if (!key || seenIconKeys.has(key)) continue;
            seenIconKeys.add(key);
            hasFreshIcon = true;
        }
        if (!hasFreshIcon) continue;
        compactHtmls.push(html);
    }

    return compactHtmls;
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

    for (const company of sortTripDetailTransferCompanies(companyOrder, { toText })) {
        for (const entry of groups.get(company) || []) entries.push(entry);
    }

    return buildCompactTripDetailTransferItemHtmls(entries, { toText });
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

    const stationGroupsIndex = await getStationGroupsIndex();
    const currentRouteId = toText(currentLineId);
    const out = new Map();
    const transferItemEntryByRouteId = new Map();

    const buildTransferEntry = async (routeIdRaw, stationCodeRaw = '') => {
        const routeId = toText(routeIdRaw);
        if (!routeId) return null;
        const stationCode = toText(stationCodeRaw);
        const cacheKey = `${routeId}||${stationCode}`;
        if (transferItemEntryByRouteId.has(cacheKey)) return transferItemEntryByRouteId.get(cacheKey);

        const meta = getLineMeta(routeId) || {};
        const company = toText(meta?.company) || routeId.split('.')[0] || '';
        const lineColor = toText(meta?.color) || '#888';
        const displayName = toText(meta?.name) || routeId;
        const iconMeta = await getResolvedRouteIconMeta(routeId, { color: lineColor });
        let lineIconHtml = '';
        let mutedLineIconHtml = '';
        if (stationCode) {
            const badgeEl = createStationCodeBadgeElement({
                code: stationCode,
                color: toText(iconMeta?.color) || lineColor,
                routeId: toText(iconMeta?.id) || routeId
            });
            const mutedBadgeEl = createStationCodeBadgeElement({
                code: stationCode,
                color: toText(iconMeta?.color) || lineColor,
                routeId: toText(iconMeta?.id) || routeId,
                muted: true
            });
            lineIconHtml = formatPanelTripDetailTransferStationBadgeHtml(badgeEl);
            mutedLineIconHtml = formatPanelTripDetailTransferStationBadgeHtml(mutedBadgeEl);
        } else if (iconMeta && (iconMeta.code || iconMeta.color)) {
            const iconEl = createLineIconElement({ routeId: iconMeta.id, code: iconMeta.code, color: iconMeta.color || lineColor });
            const mutedIconEl = createLineIconElement({ routeId: iconMeta.id, code: iconMeta.code, color: iconMeta.color || lineColor, muted: true });
            lineIconHtml = formatPanelTripDetailLineIconHtml(iconEl);
            mutedLineIconHtml = formatPanelTripDetailLineIconHtml(mutedIconEl);
        }
        const html = `<span class="panel-trip-detail-transfer-item">${lineIconHtml}<span class="panel-trip-detail-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(displayName)}</span></span>`;
        const mutedHtml = `<span class="panel-trip-detail-transfer-item">${mutedLineIconHtml || lineIconHtml}<span class="panel-trip-detail-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(displayName)}</span></span>`;
        const entry = {
            routeId,
            company,
            displayName,
            html,
            mutedHtml,
            iconCodes: [stationCode || toText(iconMeta?.code)].filter(Boolean),
            iconColor: toText(iconMeta?.color) || lineColor
        };
        transferItemEntryByRouteId.set(cacheKey, entry);
        return entry;
    };

    for (const stationId of ids) {
        const groupIdsRaw = stationGroupsIndex?.get?.(stationId);
        const groupIds = Array.isArray(groupIdsRaw) && groupIdsRaw.length
            ? groupIdsRaw.map((value) => toText(value)).filter(Boolean)
            : [stationId];
        const selfRouteId = getRouteIdFromStationId(stationId, toText);
        const routeIds = [];
        const stationIdByRouteId = new Map();
        const seenRouteIds = new Set();
        for (const groupId of groupIds) {
            const routeId = getRouteIdFromStationId(groupId, toText);
            if (!routeId || routeId === selfRouteId || routeId === currentRouteId || seenRouteIds.has(routeId)) continue;
            seenRouteIds.add(routeId);
            routeIds.push(routeId);
            stationIdByRouteId.set(routeId, groupId);
        }
        if (!routeIds.length) continue;

        const entriesRaw = await Promise.all(routeIds.map((routeId) => (
            buildTransferEntry(routeId, getStationCode(stationIdByRouteId.get(routeId)))
        )));
        const companyOrder = [];
        const groups = new Map();
        for (const entry of entriesRaw) {
            if (!entry?.html) continue;
            const company = toText(entry.company);
            if (!groups.has(company)) {
                groups.set(company, []);
                companyOrder.push(company);
            }
            groups.get(company).push(entry);
        }

        const sortedEntries = [];
        for (const company of sortTripDetailTransferCompanies(companyOrder, { toText })) {
            for (const entry of groups.get(company) || []) sortedEntries.push(entry);
        }
        const popoverItemHtmls = sortedEntries.map((entry) => toText(entry?.html)).filter(Boolean);
        const itemHtmls = buildCompactTripDetailTransferItemHtmls(sortedEntries, { toText });
        const mutedItemHtmls = buildCompactTripDetailTransferItemHtmls(sortedEntries, { htmlKey: 'mutedHtml', toText });
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

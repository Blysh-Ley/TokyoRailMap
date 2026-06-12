import { createLineIconElement, getResolvedRouteIconMeta } from '../../lib/line-icons.js';
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

const buildCompactTripDetailTransferItemHtmls = (entries, { toText = defaultToText } = {}) => {
    const seenIconKeys = new Set();
    const compactHtmls = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        const html = toText(entry?.html);
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

export const buildTripDetailTransferDisplayByStationId = async ({
    currentLineId = '',
    escapeHtml = (value) => String(value ?? ''),
    getLineMeta = () => null,
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

    const buildTransferEntry = async (routeIdRaw) => {
        const routeId = toText(routeIdRaw);
        if (!routeId) return null;
        if (transferItemEntryByRouteId.has(routeId)) return transferItemEntryByRouteId.get(routeId);

        const meta = getLineMeta(routeId) || {};
        const company = toText(meta?.company) || routeId.split('.')[0] || '';
        const lineColor = toText(meta?.color) || '#888';
        const displayName = toText(meta?.name) || routeId;
        const iconMeta = await getResolvedRouteIconMeta(routeId, { color: lineColor });
        let lineIconHtml = '';
        if (iconMeta && (iconMeta.code || iconMeta.color)) {
            const iconEl = createLineIconElement({ routeId: iconMeta.id, code: iconMeta.code, color: iconMeta.color || lineColor });
            lineIconHtml = formatPanelTripDetailLineIconHtml(iconEl);
        }
        const html = `<span class="panel-trip-detail-transfer-item">${lineIconHtml}<span class="panel-trip-detail-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(displayName)}</span></span>`;
        const entry = {
            routeId,
            company,
            displayName,
            html,
            iconCodes: [toText(iconMeta?.code)].filter(Boolean),
            iconColor: toText(iconMeta?.color) || lineColor
        };
        transferItemEntryByRouteId.set(routeId, entry);
        return entry;
    };

    for (const stationId of ids) {
        const groupIdsRaw = stationGroupsIndex?.get?.(stationId);
        const groupIds = Array.isArray(groupIdsRaw) && groupIdsRaw.length
            ? groupIdsRaw.map((value) => toText(value)).filter(Boolean)
            : [stationId];
        const selfRouteId = getRouteIdFromStationId(stationId, toText);
        const routeIds = [];
        const seenRouteIds = new Set();
        for (const groupId of groupIds) {
            const routeId = getRouteIdFromStationId(groupId, toText);
            if (!routeId || routeId === selfRouteId || routeId === currentRouteId || seenRouteIds.has(routeId)) continue;
            seenRouteIds.add(routeId);
            routeIds.push(routeId);
        }
        if (!routeIds.length) continue;

        const entriesRaw = await Promise.all(routeIds.map((routeId) => buildTransferEntry(routeId)));
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
        if (!itemHtmls.length && !popoverItemHtmls.length) continue;
        out.set(stationId, {
            itemHtmls,
            popoverItemHtmls,
            rowCount: Math.max(1, Math.ceil(itemHtmls.length / 5)),
            popoverRowCount: Math.max(1, Math.ceil(popoverItemHtmls.length / 5)),
            label: `换乘线路：${popoverItemHtmls.length}条`
        });
    }

    return out;
};

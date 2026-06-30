const defaultToText = (value) => String(value ?? '').trim();

export const getRouteIdFromStationId = (stationIdRaw, toText = defaultToText) => {
    const stationId = toText(stationIdRaw);
    if (!stationId) return '';
    const parts = stationId.split('.').map((part) => toText(part)).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    return parts[0] || '';
};

const normalizeTextList = (values, toText = defaultToText) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
        .map((value) => toText(value))
        .filter(Boolean)
));

const normalizeStationRef = (value, toText = defaultToText) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const stationId = toText(value.stationId || value.id);
        const displayStationIds = normalizeTextList(
            Array.isArray(value.displayStationIds) ? value.displayStationIds : [stationId],
            toText
        );
        return stationId
            ? {
                stationId,
                displayStationIds: displayStationIds.length ? displayStationIds : [stationId]
            }
            : null;
    }

    const stationId = toText(value);
    return stationId ? { stationId, displayStationIds: [stationId] } : null;
};

const normalizeStationRefs = ({
    stationIds = [],
    stationRefs = [],
    toText = defaultToText
} = {}) => {
    const refs = [];
    const seen = new Set();
    for (const value of [
        ...(Array.isArray(stationRefs) ? stationRefs : []),
        ...(Array.isArray(stationIds) ? stationIds : [])
    ]) {
        const ref = normalizeStationRef(value, toText);
        if (!ref) continue;
        const key = `${ref.stationId}||${ref.displayStationIds.join('|')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(ref);
    }
    return refs;
};

export const getTransferBadgeDedupTargets = (entry, { toText = defaultToText } = {}) => {
    const company = toText(entry?.company);
    const codes = Array.isArray(entry?.iconCodes) ? entry.iconCodes.map((code) => toText(code)).filter(Boolean) : [];
    const badgeColor = toText(entry?.iconColor || entry?.lineColor).toLowerCase();
    const displayStationIds = normalizeTextList(entry?.displayStationIds, toText);
    const stationScopes = displayStationIds.length ? displayStationIds : [''];
    if (!company) return [];
    if (codes.length) {
        return codes.flatMap((code) => stationScopes.map((stationId) => {
            const target = {
                key: `code||${company}||${code}`,
                code
            };
            if (badgeColor) target.key = `${target.key}||color||${badgeColor}`;
            if (stationId) target.key = `${target.key}||station||${stationId}`;
            return target;
        }));
    }

    const iconColor = badgeColor;
    if (!iconColor) return [];
    return stationScopes.map((stationId) => {
        const target = {
            key: `color||${company}||${iconColor}`,
            code: ''
        };
        if (stationId) target.key = `${target.key}||station||${stationId}`;
        return target;
    });
};

export const compactTransferBadgeEntries = (entries, {
    toText = defaultToText
} = {}) => {
    const seenIconKeys = new Set();
    const compactEntries = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        const targets = getTransferBadgeDedupTargets(entry, { toText });
        if (!targets.length) {
            compactEntries.push(entry);
            continue;
        }

        const freshCodes = [];
        let hasFreshIcon = false;
        for (const target of targets) {
            const key = toText(target?.key);
            if (!key || seenIconKeys.has(key)) continue;
            seenIconKeys.add(key);
            hasFreshIcon = true;
            const code = toText(target?.code);
            if (code) freshCodes.push(code);
        }

        if (!hasFreshIcon) continue;
        compactEntries.push({
            ...entry,
            compactIconCodes: freshCodes.length ? freshCodes : null
        });
    }

    return compactEntries;
};

export const sortTransferBadgeCompanies = (companyOrder, {
    preferredCompanyOrder = [],
    toText = defaultToText
} = {}) => {
    const preferredCompanyOrderIndex = new Map(
        (Array.isArray(preferredCompanyOrder) ? preferredCompanyOrder : [])
            .map((company, index) => [toText(company), index])
    );
    const originalIndex = new Map(
        (Array.isArray(companyOrder) ? companyOrder : [])
            .map((company, index) => [toText(company), index])
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

export const sortTransferBadgeEntriesByCompany = (entries, {
    preferredCompanyOrder = [],
    toText = defaultToText
} = {}) => {
    const companyOrder = [];
    const groups = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        const routeId = toText(entry?.routeId || entry?.rid);
        const company = toText(entry?.company) || routeId.split('.')[0] || '';
        if (!groups.has(company)) {
            groups.set(company, []);
            companyOrder.push(company);
        }
        groups.get(company).push({
            ...entry,
            company
        });
    }

    const sortedEntries = [];
    for (const company of sortTransferBadgeCompanies(companyOrder, { preferredCompanyOrder, toText })) {
        for (const entry of groups.get(company) || []) sortedEntries.push(entry);
    }
    return sortedEntries;
};

export const getSupplementalTransferServiceFlags = ({
    serviceConfigsByKey = {},
    stationIds = [],
    stationRefs = [],
    toText = defaultToText
} = {}) => {
    const refs = normalizeStationRefs({ stationIds, stationRefs, toText });
    return Object.fromEntries(
        Object.entries(serviceConfigsByKey || {}).map(([category, info]) => {
            const stationSet = info?.stationIdSet instanceof Set
                ? info.stationIdSet
                : new Set(Array.isArray(info?.stations) ? info.stations.map((stationId) => toText(stationId)).filter(Boolean) : []);
            return [
                category,
                !!stationSet.size && refs.some((ref) => stationSet.has(ref.stationId))
            ];
        })
    );
};

const getSupplementalTransferServiceMatch = (info, stationRefs, {
    toText = defaultToText
} = {}) => {
    const stationSet = info?.stationIdSet instanceof Set
        ? info.stationIdSet
        : new Set(Array.isArray(info?.stations) ? info.stations.map((stationId) => toText(stationId)).filter(Boolean) : []);
    if (!stationSet.size) return { stationIds: [], displayStationIds: [] };

    const stationIds = [];
    const displayStationIds = [];
    const seenStationIds = new Set();
    const seenDisplayStationIds = new Set();
    for (const ref of Array.isArray(stationRefs) ? stationRefs : []) {
        const stationId = toText(ref?.stationId);
        if (!stationId || !stationSet.has(stationId)) continue;
        if (!seenStationIds.has(stationId)) {
            seenStationIds.add(stationId);
            stationIds.push(stationId);
        }
        const ids = normalizeTextList(ref?.displayStationIds?.length ? ref.displayStationIds : [stationId], toText);
        const realDisplayIds = ids.filter((id) => id !== stationId);
        for (const displayStationId of (realDisplayIds.length ? realDisplayIds : ids)) {
            if (seenDisplayStationIds.has(displayStationId)) continue;
            seenDisplayStationIds.add(displayStationId);
            displayStationIds.push(displayStationId);
        }
    }

    return {
        stationIds,
        displayStationIds: displayStationIds.length ? displayStationIds : stationIds.slice()
    };
};

export const buildSupplementalTransferBadgeEntries = ({
    existingDisplayStationIds = [],
    serviceConfigsByKey = {},
    stationIds = [],
    stationRefs = [],
    stationServiceFlags = {},
    toText = defaultToText
} = {}) => {
    const normalizedStationRefs = normalizeStationRefs({ stationIds, stationRefs, toText });
    const transferServiceFlags = getSupplementalTransferServiceFlags({
        serviceConfigsByKey,
        stationRefs: normalizedStationRefs,
        toText
    });
    const occupiedDisplayStationIds = new Set(normalizeTextList(existingDisplayStationIds, toText));
    const entries = [];
    for (const [category, info] of Object.entries(serviceConfigsByKey || {})) {
        if (!stationServiceFlags?.[category] && !transferServiceFlags?.[category]) continue;
        const serviceMatch = getSupplementalTransferServiceMatch(info, normalizedStationRefs, { toText });
        if (!serviceMatch.displayStationIds.length) continue;
        if (serviceMatch.displayStationIds.some((stationId) => occupiedDisplayStationIds.has(stationId))) continue;

        const routeId = `${toText(info?.operator) || toText(info?.lineId).split('.')[0] || 'JR-East'}.${toText(category)}`;
        entries.push({
            routeId,
            rid: routeId,
            company: toText(info?.operator) || routeId.split('.')[0] || '',
            serviceKey: toText(category),
            displayName: toText(info?.lineName),
            lineColor: toText(info?.color) || '#888',
            iconColor: toText(info?.color) || '#888',
            iconCodes: [],
            stationIds: serviceMatch.stationIds,
            displayStationIds: serviceMatch.displayStationIds
        });
    }
    return entries;
};

const normalizeGroupIds = (value, stationId, toText = defaultToText) => {
    let ids = [];
    if (value instanceof Set) {
        ids = Array.from(value);
    } else if (Array.isArray(value)) {
        ids = value;
    }
    const normalized = ids.map((id) => toText(id)).filter(Boolean);
    return normalized.length ? normalized : [stationId].filter(Boolean);
};

export const buildTransferBadgeEntriesByStationId = async ({
    currentLineId = '',
    dedupeDisplayNames = false,
    getGroupIdsForStation = async () => [],
    getLineMeta = () => null,
    getStationCode = () => '',
    preferredCompanyOrder = [],
    resolveIconMeta = async () => null,
    stationIds = [],
    toText = defaultToText
} = {}) => {
    const ids = Array.from(new Set(
        (Array.isArray(stationIds) ? stationIds : [])
            .map((value) => toText(value))
            .filter(Boolean)
    ));
    const currentRouteId = toText(currentLineId);
    const out = new Map();

    for (const stationId of ids) {
        const groupIds = normalizeGroupIds(await getGroupIdsForStation(stationId), stationId, toText);
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

        const rawEntries = [];
        const seenDisplayNames = new Set();
        for (const routeId of routeIds) {
            const transferStationId = toText(stationIdByRouteId.get(routeId));
            const lineMeta = getLineMeta(routeId, { stationId, transferStationId }) || {};
            const company = toText(lineMeta?.company) || routeId.split('.')[0] || '';
            const displayName = toText(lineMeta?.name || lineMeta?.displayName) || routeId;
            if (dedupeDisplayNames) {
                if (!displayName || seenDisplayNames.has(displayName)) continue;
                seenDisplayNames.add(displayName);
            }

            const lineColor = toText(lineMeta?.color) || '#888';
            const stationCode = toText(getStationCode(transferStationId, { routeId, stationId }) || '');
            const displayStationIds = normalizeGroupIds(await getGroupIdsForStation(transferStationId), transferStationId, toText);
            const iconMeta = await resolveIconMeta(routeId, { color: lineColor, stationId, transferStationId }) || null;
            const iconRouteId = toText(iconMeta?.id) || routeId;
            const iconCode = toText(iconMeta?.code);
            const iconColor = toText(iconMeta?.color) || lineColor;
            rawEntries.push({
                routeId,
                stationId: transferStationId,
                company,
                displayName,
                lineColor,
                stationCode,
                displayStationIds,
                iconRouteId,
                iconCode,
                iconColor,
                iconCodes: [stationCode || iconCode].filter(Boolean),
                hasIconMeta: !!iconMeta && !!(iconCode || toText(iconMeta?.color))
            });
        }

        const entries = sortTransferBadgeEntriesByCompany(rawEntries, {
            preferredCompanyOrder,
            toText
        });
        const compactEntries = compactTransferBadgeEntries(entries, { toText });
        if (!entries.length && !compactEntries.length) continue;
        out.set(stationId, { entries, compactEntries });
    }

    return out;
};

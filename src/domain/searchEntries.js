const normalizeText = (value) => String(value ?? '').trim();

const normalizeAllowedTypes = (allowedTypes) => {
    if (allowedTypes == null) return null;
    const values = allowedTypes instanceof Set
        ? Array.from(allowedTypes)
        : (Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes]);
    return new Set(values.map((value) => normalizeText(value).toLowerCase()).filter(Boolean));
};

export const STATION_SEARCH_ENTRY_TYPES = Object.freeze(['station']);

export const normalizeSearchEntry = (item) => {
    if (typeof item === 'string') {
        const text = normalizeText(item);
        return text ? { type: 'text', text, favorite: false } : null;
    }
    if (!item || typeof item !== 'object') return null;

    const text = normalizeText(item.text);
    if (!text) return null;
    const id = normalizeText(item.id);
    const rawType = normalizeText(item.type).toLowerCase();
    // 旧版历史记录可能把纯查询文本持久化成无 id 的 station。
    // station 是结构化实体，缺少 id 时统一迁移为 text，避免进入站点专用入口。
    const type = rawType === 'station' && !id
        ? 'text'
        : (rawType || (id ? 'station' : 'text'));
    const normalized = {
        ...item,
        type,
        text,
        favorite: item.favorite === true
    };

    if (id) normalized.id = id;
    else delete normalized.id;
    if (Array.isArray(item.lineIds)) {
        normalized.lineIds = Array.from(new Set(item.lineIds.map((value) => normalizeText(value)).filter(Boolean)));
    }
    if (item.stationGroupKey) normalized.stationGroupKey = normalizeText(item.stationGroupKey) || undefined;
    if (item.color) normalized.color = normalizeText(item.color) || undefined;
    if (item.code) normalized.code = normalizeText(item.code) || undefined;
    if (item.logoUrl) normalized.logoUrl = normalizeText(item.logoUrl) || undefined;
    normalized.isTransfer = item.isTransfer === true;
    return normalized;
};

export const getSearchEntryKey = (item) => {
    const value = normalizeSearchEntry(item);
    if (!value) return '';
    return value.id
        ? `${value.type || 'station'}:${value.id}`
        : `text:${value.text}`;
};

export const sortSearchHistoryEntries = (items) => (
    (Array.isArray(items) ? items.slice() : []).sort((a, b) => (
        Number(b?.favorite === true) - Number(a?.favorite === true)
    ))
);

export const matchesSearchEntryTypes = (item, allowedTypes = null) => {
    const allowSet = normalizeAllowedTypes(allowedTypes);
    if (!allowSet) return true;
    const value = normalizeSearchEntry(item);
    if (!value) return false;
    if (value.type === 'station' && !value.id) return false;
    return allowSet.has(value.type);
};

export const filterSearchEntries = (items, { allowedTypes = null, limit = Infinity } = {}) => {
    const maxItems = Number.isFinite(Number(limit))
        ? Math.max(0, Math.floor(Number(limit)))
        : Infinity;
    if (maxItems === 0) return [];
    const out = [];
    for (const item of Array.isArray(items) ? items : []) {
        if (!item || !matchesSearchEntryTypes(item, allowedTypes)) continue;
        out.push(item);
        if (out.length >= maxItems) break;
    }
    return out;
};

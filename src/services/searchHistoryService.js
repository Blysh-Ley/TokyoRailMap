import {
    filterSearchEntries,
    getSearchEntryKey,
    matchesSearchEntryTypes,
    normalizeSearchEntry,
    sortSearchHistoryEntries
} from '../domain/searchEntries.js';

const DEFAULT_HISTORY_KEY = 'TokyoRailSearchHistory';
const DEFAULT_MAX_ITEMS = 20;

export const createSearchHistoryService = ({
    storage = null,
    getStorage = null,
    key = DEFAULT_HISTORY_KEY,
    maxItems = DEFAULT_MAX_ITEMS,
    mergeItems = (items) => items
} = {}) => {
    const historyKey = String(key || DEFAULT_HISTORY_KEY);
    const historyLimit = Math.max(1, Math.floor(Number(maxItems) || DEFAULT_MAX_ITEMS));
    const resolveStorage = () => {
        try {
            return typeof getStorage === 'function' ? getStorage() : storage;
        } catch {
            return null;
        }
    };

    const normalizeItems = (items) => {
        const normalized = (Array.isArray(items) ? items : [])
            .map(normalizeSearchEntry)
            .filter(Boolean);
        let merged = normalized;
        try {
            const result = mergeItems(normalized);
            if (Array.isArray(result)) merged = result;
        } catch {
            // History remains usable even when optional station metadata enrichment fails.
        }
        return sortSearchHistoryEntries(merged.map(normalizeSearchEntry).filter(Boolean)).slice(0, historyLimit);
    };

    const readAll = () => {
        try {
            const raw = resolveStorage()?.getItem?.(historyKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return normalizeItems(Array.isArray(parsed) ? parsed : []);
        } catch {
            return [];
        }
    };

    const write = (items) => {
        const list = normalizeItems(items);
        try {
            resolveStorage()?.setItem?.(historyKey, JSON.stringify(list));
        } catch {
            // Search history persistence is best effort.
        }
        return list;
    };

    const read = ({ allowedTypes = null, limit = historyLimit } = {}) => (
        filterSearchEntries(readAll(), { allowedTypes, limit })
    );

    const add = (item) => {
        const value = normalizeSearchEntry(item);
        if (!value) return readAll();
        const keyValue = getSearchEntryKey(value);
        const list = readAll();
        const existing = list.find((entry) => getSearchEntryKey(entry) === keyValue) || null;
        if (existing?.favorite === true) value.favorite = true;
        return write([value, ...list.filter((entry) => getSearchEntryKey(entry) !== keyValue)]);
    };

    const toggleFavorite = (item) => {
        const keyValue = getSearchEntryKey(item);
        if (!keyValue) return readAll();
        return write(readAll().map((entry) => (
            getSearchEntryKey(entry) === keyValue
                ? { ...entry, favorite: entry.favorite !== true }
                : entry
        )));
    };

    const remove = (item) => {
        const keyValue = getSearchEntryKey(item);
        if (!keyValue) return readAll();
        return write(readAll().filter((entry) => getSearchEntryKey(entry) !== keyValue));
    };

    const clear = ({ allowedTypes = null } = {}) => {
        if (allowedTypes == null) return write([]);
        return write(readAll().filter((entry) => !matchesSearchEntryTypes(entry, allowedTypes)));
    };

    return Object.freeze({ add, clear, read, remove, toggleFavorite, write });
};

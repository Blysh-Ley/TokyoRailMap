const defaultToText = (value) => String(value ?? '').trim();

export const DIR_FILTER_FIELDS = ['origins', 'terminals', 'types'];

export const DIR_FILTER_FIELD_TO_ROW_KEY = {
    origins: 'origin',
    terminals: 'terminal',
    types: 'type'
};

export const createEmptyDirFilterState = () => ({
    origins: new Set(),
    terminals: new Set(),
    types: new Set()
});

export const normalizeDirFilterState = (state) => {
    const next = createEmptyDirFilterState();
    for (const field of DIR_FILTER_FIELDS) {
        const source = state?.[field];
        if (!(source instanceof Set)) continue;
        for (const value of source) {
            const text = defaultToText(value);
            if (text) next[field].add(text);
        }
    }
    return next;
};

export const toDirFilterRow = (row, { toText = defaultToText } = {}) => ({
    origin: toText(row?.origin ?? row?.originName),
    terminal: toText(row?.terminal ?? row?.terminalDisplayName ?? row?.terminalName ?? row?.destName),
    type: toText(row?.type ?? row?.typeName)
});

export const hasDirFilterRowValue = (row) => {
    const filterRow = toDirFilterRow(row);
    return !!(filterRow.origin || filterRow.terminal || filterRow.type);
};

export const collectDirFilterOptionSets = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const out = createEmptyDirFilterState();
    for (const row of list) {
        const filterRow = toDirFilterRow(row);
        if (filterRow.origin) out.origins.add(filterRow.origin);
        if (filterRow.terminal) out.terminals.add(filterRow.terminal);
        if (filterRow.type) out.types.add(filterRow.type);
    }
    return out;
};

export const createAllSelectedDirFilterState = (rows) => collectDirFilterOptionSets(rows);

export const syncDirFilterStateWithRows = (state, rows) => {
    const source = normalizeDirFilterState(state);
    const allValues = collectDirFilterOptionSets(rows);
    const next = createEmptyDirFilterState();
    for (const field of DIR_FILTER_FIELDS) {
        for (const value of source[field]) {
            if (allValues[field].has(value)) next[field].add(value);
        }
    }
    return next;
};

export const isAllSelectedDirFilterState = (state, rows) => {
    const allValues = collectDirFilterOptionSets(rows);
    const current = normalizeDirFilterState(state);
    for (const field of DIR_FILTER_FIELDS) {
        if (current[field].size !== allValues[field].size) return false;
        for (const value of allValues[field]) {
            if (!current[field].has(value)) return false;
        }
    }
    return true;
};

export const doesDirFilterRowMatchState = (row, state, { ignoreField = '' } = {}) => {
    const filterRow = toDirFilterRow(row);
    const current = state || createEmptyDirFilterState();
    for (const field of DIR_FILTER_FIELDS) {
        if (ignoreField === field) continue;
        const selected = current[field];
        if (!(selected instanceof Set) || !selected.size) continue;
        const rowKey = DIR_FILTER_FIELD_TO_ROW_KEY[field];
        if (!selected.has(filterRow[rowKey])) return false;
    }
    return true;
};

export const filterRowsByDirFilterState = (rows, state, options = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((row) => doesDirFilterRowMatchState(row, state, options));
};

export const getDirFilterRowsForFacet = ({ rows, state, ignoreField = '' } = {}) => (
    filterRowsByDirFilterState(rows, state, { ignoreField })
);

export const buildDirFilterFacetEntries = ({ rows, field, state }) => {
    const rowKey = DIR_FILTER_FIELD_TO_ROW_KEY[field];
    if (!rowKey) return [];

    const scopedRows = getDirFilterRowsForFacet({ rows, state, ignoreField: field });
    const sourceRows = scopedRows.length ? scopedRows : (Array.isArray(rows) ? rows : []);
    const counts = new Map();
    for (const row of sourceRows) {
        const value = toDirFilterRow(row)[rowKey];
        if (!value) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
    }

    const selected = state?.[field] instanceof Set ? state[field] : new Set();
    for (const value of selected) {
        const text = defaultToText(value);
        if (!text || counts.has(text)) continue;
        counts.set(text, 0);
    }

    return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count: Number(count) || 0 }))
        .sort((a, b) => {
            const countDelta = b.count - a.count;
            if (countDelta) return countDelta;
            return String(a.value).localeCompare(String(b.value));
        });
};

export const setDirFilterAllSelected = (rows, checked) => (
    checked ? createAllSelectedDirFilterState(rows) : createEmptyDirFilterState()
);

export const toggleDirFilterFieldValue = (state, { field, value, checked }) => {
    if (!DIR_FILTER_FIELDS.includes(field)) return normalizeDirFilterState(state);
    const text = defaultToText(value);
    if (!text) return normalizeDirFilterState(state);

    const next = normalizeDirFilterState(state);
    if (checked) next[field].add(text);
    else next[field].delete(text);
    return next;
};

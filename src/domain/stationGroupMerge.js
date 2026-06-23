const toText = (value) => String(value ?? '').trim();

const normalizeSubgroup = (value) => {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const ids = [];
    for (const item of source) {
        const id = toText(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
};

const normalizeGroup = (value) => {
    const source = Array.isArray(value) ? value : [];
    const group = [];
    for (const item of source) {
        const subgroup = normalizeSubgroup(item);
        if (subgroup.length) group.push(subgroup);
    }
    return group;
};

const normalizeGroups = (value) => {
    const source = Array.isArray(value) ? value : [];
    const groups = [];
    for (const item of source) {
        const group = normalizeGroup(item);
        if (group.length) groups.push(group);
    }
    return groups;
};

const flattenGroupIds = (group) => {
    const ids = [];
    const seen = new Set();
    for (const subgroup of Array.isArray(group) ? group : []) {
        for (const id of normalizeSubgroup(subgroup)) {
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
};

const createUnionFind = () => {
    const parent = new Map();

    const find = (id) => {
        const key = toText(id);
        if (!key) return '';
        if (!parent.has(key)) parent.set(key, key);
        const current = parent.get(key);
        if (current !== key) parent.set(key, find(current));
        return parent.get(key);
    };

    const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (!rootA || !rootB || rootA === rootB) return;
        if (rootB < rootA) {
            parent.set(rootA, rootB);
        } else {
            parent.set(rootB, rootA);
        }
    };

    return { find, union, parent };
};

export const mergeStationGroups = (primaryGroups, extraGroups) => {
    const normalizedPrimary = normalizeGroups(primaryGroups);
    const normalizedExtra = normalizeGroups(extraGroups);
    if (!normalizedExtra.length) return normalizedPrimary;

    const allGroups = [
        ...normalizedPrimary.map((group) => ({ group, sourceRank: 0 })),
        ...normalizedExtra.map((group) => ({ group, sourceRank: 1 }))
    ];
    const unionFind = createUnionFind();

    for (const { group } of allGroups) {
        const ids = flattenGroupIds(group);
        for (const id of ids) unionFind.find(id);
        const first = ids[0] || '';
        if (!first) continue;
        for (const id of ids.slice(1)) unionFind.union(first, id);
    }

    const groupsByRoot = new Map();
    allGroups.forEach(({ group, sourceRank }, groupIndex) => {
        const ids = flattenGroupIds(group);
        const root = unionFind.find(ids[0]);
        if (!root) return;
        if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
        groupsByRoot.get(root).push({ group, sourceRank, groupIndex });
    });

    const mergedGroups = [];
    for (const entries of groupsByRoot.values()) {
        entries.sort((a, b) => a.sourceRank - b.sourceRank || a.groupIndex - b.groupIndex);
        const seenIds = new Set();
        const mergedGroup = [];
        for (const entry of entries) {
            for (const subgroup of entry.group) {
                const ids = [];
                for (const id of subgroup) {
                    if (seenIds.has(id)) continue;
                    seenIds.add(id);
                    ids.push(id);
                }
                if (ids.length) mergedGroup.push(ids);
            }
        }
        if (mergedGroup.length) mergedGroups.push(mergedGroup);
    }

    return mergedGroups;
};

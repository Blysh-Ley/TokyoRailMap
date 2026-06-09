import { resolveMainLineIdForIcon } from '../../lib/line-icons.js';

const toText = (value) => String(value ?? '').trim();

export const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];

    const text = value.trim();
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return text ? [text] : [];
};

export const buildPanelLineMergeInfo = ({ servingLineIds, getLineMeta } = {}) => {
    const ids = Array.from(new Set(
        (Array.isArray(servingLineIds) ? servingLineIds : [])
            .map((value) => toText(value))
            .filter(Boolean)
    ));
    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const idIndex = new Map(ids.map((id) => [id, true]));

    const lineGroupByMainId = new Map();
    const displayLineIds = [];

    for (const id of ids) {
        const resolvedMainId = toText(resolveMainLineIdForIcon(id)) || id;

        let mainId = id;
        if (resolvedMainId && resolvedMainId !== id && idIndex.has(resolvedMainId)) {
            const sourceCompany = toText(safeGetLineMeta(id)?.company);
            const targetCompany = toText(safeGetLineMeta(resolvedMainId)?.company);
            const sameCompany = !sourceCompany || !targetCompany || sourceCompany === targetCompany;
            if (sameCompany) mainId = resolvedMainId;
        }

        if (!lineGroupByMainId.has(mainId)) {
            lineGroupByMainId.set(mainId, []);
            displayLineIds.push(mainId);
        }
        lineGroupByMainId.get(mainId).push(id);
    }

    for (const [mainId, groupedIds] of lineGroupByMainId.entries()) {
        const dedupedIds = Array.from(new Set(groupedIds));
        if (dedupedIds.includes(mainId)) {
            dedupedIds.sort((left, right) => {
                if (left === mainId) return -1;
                if (right === mainId) return 1;
                return 0;
            });
        }
        lineGroupByMainId.set(mainId, dedupedIds);
    }

    return { displayLineIds, lineGroupByMainId };
};

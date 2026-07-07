const toText = (value) => String(value ?? '').trim();

const uniqueTexts = (values) => {
    const seen = new Set();
    const out = [];
    for (const value of Array.isArray(values) ? values : []) {
        const text = toText(value);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out;
};

export const getLineIdFromStationId = (stationId) => {
    const id = toText(stationId);
    if (!id) return '';
    const parts = id.split('.').map(toText).filter(Boolean);
    if (parts.length < 3) return '';
    return parts.slice(0, -1).join('.');
};

const buildById = (rows) => {
    const out = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const id = toText(row?.id);
        if (!id || out.has(id)) continue;
        out.set(id, row);
    }
    return out;
};

const getRailwayStationIds = (railway) => {
    const stationIds = Array.isArray(railway?.stations)
        ? railway.stations
        : (Array.isArray(railway?.stationIds) ? railway.stationIds : []);
    return stationIds.map(toText).filter(Boolean);
};

const getAlternateStationId = (stationById, stationId) => {
    const station = stationById.get(toText(stationId));
    return toText(station?.alternate);
};

const addToSetMap = (map, key, value) => {
    const k = toText(key);
    const v = toText(value);
    if (!k || !v) return;
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(v);
};

const setPairMap = (map, lineId, stationId, value) => {
    const line = toText(lineId);
    const station = toText(stationId);
    const v = toText(value);
    if (!line || !station || !v) return;
    map.set(`${line}\u0000${station}`, v);
};

const setDirectionMap = (map, lineId, stationId, sourceDirection, displayDirection) => {
    const line = toText(lineId);
    const station = toText(stationId);
    const sourceDir = toText(sourceDirection);
    const displayDir = toText(displayDirection);
    if (!line || !station || !sourceDir || !displayDir) return;
    map.set(`${line}\u0000${station}\u0000${sourceDir}`, displayDir);
};

export const getPairMapValue = (map, lineId, stationId) => {
    if (!map || typeof map.get !== 'function') return '';
    return toText(map.get(`${toText(lineId)}\u0000${toText(stationId)}`));
};

const parsePairMapKey = (key) => {
    const text = toText(key);
    if (!text) return null;
    const parts = text.split('\u0000');
    if (parts.length !== 2) return null;
    const lineId = toText(parts[0]);
    const stationId = toText(parts[1]);
    if (!lineId || !stationId) return null;
    return { lineId, stationId };
};

const parseDirectionMapKey = (key) => {
    const text = toText(key);
    if (!text) return null;
    const parts = text.split('\u0000');
    if (parts.length !== 3) return null;
    const lineId = toText(parts[0]);
    const stationId = toText(parts[1]);
    const direction = toText(parts[2]);
    if (!lineId || !stationId || !direction) return null;
    return { direction, lineId, stationId };
};

const buildDirectionMapForLineStation = (map, lineId, stationId) => {
    const out = {};
    if (!map || typeof map.entries !== 'function') return out;
    const sourceLineId = toText(lineId);
    const sourceStationId = toText(stationId);
    if (!sourceLineId || !sourceStationId) return out;

    for (const [rawKey, rawDisplayDirection] of map.entries()) {
        const parsed = parseDirectionMapKey(rawKey);
        const displayDirection = toText(rawDisplayDirection);
        if (
            !parsed ||
            !displayDirection ||
            parsed.lineId !== sourceLineId ||
            parsed.stationId !== sourceStationId
        ) {
            continue;
        }
        out[parsed.direction] = displayDirection;
    }
    return out;
};

export const buildAlternateTripSourceIndex = (alternateLineMembership = null) => {
    const sourceMap = alternateLineMembership?.alternateStationIdByLineStationId;
    const lineMap = alternateLineMembership?.alternateLineIdByLineStationId;
    const directionMap = alternateLineMembership?.alternateDirectionByLineStationDirection;
    const out = new Map();
    if (!sourceMap || typeof sourceMap.entries !== 'function') return out;

    for (const [rawKey, rawAlternateStationId] of sourceMap.entries()) {
        const parsed = parsePairMapKey(rawKey);
        const alternateStationId = toText(rawAlternateStationId);
        if (!parsed || !alternateStationId) continue;

        const alternateLineId = toText(lineMap?.get?.(rawKey));
        if (!alternateLineId) continue;

        const key = `${alternateStationId}\u0000${alternateLineId}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push({
            displayLineId: alternateLineId,
            displayStationId: alternateStationId,
            directionBySourceDirection: buildDirectionMapForLineStation(directionMap, parsed.lineId, parsed.stationId),
            sourceLineId: parsed.lineId,
            sourceStationId: parsed.stationId
        });
    }

    for (const [key, list] of out.entries()) {
        const seen = new Set();
        const deduped = [];
        for (const item of list) {
            const dedupeKey = `${item.sourceLineId}\u0000${item.sourceStationId}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            deduped.push(item);
        }
        out.set(key, deduped);
    }

    return out;
};

export const getAlternateTripSources = (alternateTripSourceIndex, stationId, lineId) => {
    if (!alternateTripSourceIndex || typeof alternateTripSourceIndex.get !== 'function') return [];
    const key = `${toText(stationId)}\u0000${toText(lineId)}`;
    const list = alternateTripSourceIndex.get(key);
    return Array.isArray(list) ? list.slice() : [];
};

const getSetMapValues = (map, key) => {
    if (!map || typeof map.get !== 'function') return new Set();
    const value = map.get(toText(key));
    if (value instanceof Set) return new Set(Array.from(value).map(toText).filter(Boolean));
    return new Set(Array.isArray(value) ? value.map(toText).filter(Boolean) : []);
};

export const filterLineStationIdsForAlternateMembership = (
    lineId,
    stationIds,
    alternateLineMembership = null
) => {
    const id = toText(lineId);
    const ids = Array.isArray(stationIds) ? stationIds.map(toText).filter(Boolean) : [];
    if (!id || !ids.length) return ids;
    if (alternateLineMembership?.fullAlternateLineIds?.has?.(id)) return [];

    const hiddenStationIds = getSetMapValues(alternateLineMembership?.stationMembershipHiddenIdsByLineId, id);
    if (!hiddenStationIds.size) return ids;
    return ids.filter((stationId) => !hiddenStationIds.has(stationId));
};

const collectAlternateRanges = (stationIds, stationById) => {
    const ranges = [];
    let start = -1;
    for (let i = 0; i <= stationIds.length; i++) {
        const hasAlternate = i < stationIds.length && !!getAlternateStationId(stationById, stationIds[i]);
        if (hasAlternate && start < 0) {
            start = i;
        } else if (!hasAlternate && start >= 0) {
            ranges.push({ startIndex: start, endIndex: i - 1 });
            start = -1;
        }
    }
    return ranges;
};

const collectReferencedRailwayIds = (value, out = new Set()) => {
    if (Array.isArray(value)) {
        for (const item of value) collectReferencedRailwayIds(item, out);
        return out;
    }
    if (!value || typeof value !== 'object') return out;

    const railwayId = toText(value.railway);
    if (railwayId) out.add(railwayId);

    for (const item of Object.values(value)) {
        if (item && typeof item === 'object') collectReferencedRailwayIds(item, out);
    }
    return out;
};

const getCoordinatesRailways = (coordinates) => {
    if (Array.isArray(coordinates)) return coordinates;
    if (Array.isArray(coordinates?.railways)) return coordinates.railways;
    return [];
};

const collectBorrowedGeometryLineIds = (coordinatesByLineId, lineId) => {
    const id = toText(lineId);
    const entry = coordinatesByLineId.get(id);
    const refs = Array.from(collectReferencedRailwayIds(entry));
    return uniqueTexts(refs.filter((refId) => refId !== id)).sort((a, b) => a.localeCompare(b));
};

const addBoundaryExpansionIndex = (out, index, stationIds) => {
    if (index < 0 || index >= stationIds.length) return;
    out.add(index);
};

const buildRangeRule = ({ lineId, stationIds, stationById, range, borrowedGeometryLineIds }) => {
    const allIndexes = stationIds.map((_, index) => index);
    const rangeIndexes = allIndexes.filter((index) => index >= range.startIndex && index <= range.endIndex);
    const isFullLine = stationIds.length > 0 && range.startIndex === 0 && range.endIndex === stationIds.length - 1;
    const highlightIndexes = new Set(rangeIndexes);

    if (!isFullLine) {
        addBoundaryExpansionIndex(highlightIndexes, range.startIndex - 1, stationIds);
        addBoundaryExpansionIndex(highlightIndexes, range.endIndex + 1, stationIds);
    }

    const alternateStationIdsByStationId = {};
    const alternateLineIdsByStationId = {};
    for (const index of rangeIndexes) {
        const stationId = stationIds[index];
        const alternateStationId = getAlternateStationId(stationById, stationId);
        const alternateLineId = getLineIdFromStationId(alternateStationId);
        if (!alternateStationId || !alternateLineId) continue;
        alternateStationIdsByStationId[stationId] = alternateStationId;
        alternateLineIdsByStationId[stationId] = alternateLineId;
    }

    const firstAlternateStationId = getAlternateStationId(stationById, stationIds[range.startIndex]);
    const lastAlternateStationId = getAlternateStationId(stationById, stationIds[range.endIndex]);
    const firstAlternateLineId = getLineIdFromStationId(firstAlternateStationId);
    const lastAlternateLineId = getLineIdFromStationId(lastAlternateStationId);
    for (const index of Array.from(highlightIndexes).sort((a, b) => a - b)) {
        if (index >= range.startIndex && index <= range.endIndex) continue;
        const stationId = stationIds[index];
        const edgeAlternateStationId = index < range.startIndex ? firstAlternateStationId : lastAlternateStationId;
        const edgeAlternateLineId = index < range.startIndex ? firstAlternateLineId : lastAlternateLineId;
        if (edgeAlternateStationId) alternateStationIdsByStationId[stationId] = edgeAlternateStationId;
        if (edgeAlternateLineId) alternateLineIdsByStationId[stationId] = edgeAlternateLineId;
    }

    const alternateLineIds = uniqueTexts(Object.values(alternateLineIdsByStationId)).sort((a, b) => a.localeCompare(b));
    const stationMembershipStationIds = rangeIndexes.map((index) => stationIds[index]);
    const highlightStationIds = Array.from(highlightIndexes).sort((a, b) => a - b).map((index) => stationIds[index]);
    const boundaryExpansionStationIds = highlightStationIds.filter((stationId) => !stationMembershipStationIds.includes(stationId));

    return {
        lineId,
        kind: isFullLine
            ? 'full-line-alternate'
            : (rangeIndexes.length === 1 ? 'single-point-alternate' : 'continuous-alternate'),
        startIndex: range.startIndex,
        endIndex: range.endIndex,
        isFullLine,
        touchesStart: range.startIndex === 0,
        touchesEnd: range.endIndex === stationIds.length - 1,
        stationMembershipStationIds,
        highlightStationIds,
        boundaryExpansionStationIds,
        alternateStationIdsByStationId,
        alternateLineIdsByStationId,
        alternateLineIds,
        borrowedGeometryLineIds: borrowedGeometryLineIds.slice()
    };
};

export const buildAlternateLineMembership = ({
    railways = [],
    stations = [],
    coordinates = null
} = {}) => {
    const stationById = buildById(stations);
    const coordinatesByLineId = buildById(getCoordinatesRailways(coordinates));
    const stationMembershipHiddenIdsByLineId = new Map();
    const highlightHiddenIdsByLineId = new Map();
    const alternateStationIdByLineStationId = new Map();
    const alternateLineIdByLineStationId = new Map();
    const alternateDirectionByLineStationDirection = new Map();
    const highlightAlternateStationIdByLineStationId = new Map();
    const highlightAlternateLineIdByLineStationId = new Map();
    const fullAlternateLineIds = new Set();
    const rangeRules = [];

    for (const railway of Array.isArray(railways) ? railways : []) {
        const lineId = toText(railway?.id);
        if (!lineId) continue;

        const stationIds = getRailwayStationIds(railway);
        if (!stationIds.length) continue;

        const ranges = collectAlternateRanges(stationIds, stationById);
        if (!ranges.length) continue;

        const borrowedGeometryLineIds = collectBorrowedGeometryLineIds(coordinatesByLineId, lineId);
        for (const range of ranges) {
            const rule = buildRangeRule({
                lineId,
                stationIds,
                stationById,
                range,
                borrowedGeometryLineIds
            });
            rangeRules.push(rule);

            if (rule.isFullLine) fullAlternateLineIds.add(lineId);

            for (const stationId of rule.stationMembershipStationIds) {
                addToSetMap(stationMembershipHiddenIdsByLineId, lineId, stationId);
                const alternateStationId = rule.alternateStationIdsByStationId[stationId];
                const alternateLineId = rule.alternateLineIdsByStationId[stationId];
                setPairMap(alternateStationIdByLineStationId, lineId, stationId, alternateStationId);
                setPairMap(alternateLineIdByLineStationId, lineId, stationId, alternateLineId);
                const station = stationById.get(stationId);
                setDirectionMap(alternateDirectionByLineStationDirection, lineId, stationId, railway?.ascending, station?.ascending);
                setDirectionMap(alternateDirectionByLineStationDirection, lineId, stationId, railway?.descending, station?.descending);
            }

            for (const stationId of rule.highlightStationIds) {
                addToSetMap(highlightHiddenIdsByLineId, lineId, stationId);
                const alternateStationId = rule.alternateStationIdsByStationId[stationId];
                const alternateLineId = rule.alternateLineIdsByStationId[stationId];
                setPairMap(highlightAlternateStationIdByLineStationId, lineId, stationId, alternateStationId);
                setPairMap(highlightAlternateLineIdByLineStationId, lineId, stationId, alternateLineId);
            }
        }
    }

    return {
        stationMembershipHiddenIdsByLineId,
        highlightHiddenIdsByLineId,
        alternateStationIdByLineStationId,
        alternateLineIdByLineStationId,
        alternateDirectionByLineStationDirection,
        highlightAlternateStationIdByLineStationId,
        highlightAlternateLineIdByLineStationId,
        fullAlternateLineIds,
        rangeRules
    };
};

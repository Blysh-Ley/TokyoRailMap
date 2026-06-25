const VIRTUAL_STATION_PREFIX = '__preview_virtual__';

const toText = (value) => String(value ?? '').trim();

const toSet = (value) => {
    if (value instanceof Set) return new Set(Array.from(value).map(toText).filter(Boolean));
    if (Array.isArray(value)) return new Set(value.map(toText).filter(Boolean));
    return new Set();
};

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value.map(toText).filter(Boolean);
    const text = toText(value);
    if (!text) return [];
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map(toText).filter(Boolean);
        } catch {
            // fall through
        }
    }
    return [text];
};

export const isPreviewVirtualStationId = (stationId) => toText(stationId).startsWith(`${VIRTUAL_STATION_PREFIX}:`);

export const normalizePreviewVirtualStationProps = (props = {}) => {
    const id = toText(props?.id);
    const realStationId = toText(props?.realStationId || props?.real_station_id);
    if (!realStationId && !isPreviewVirtualStationId(id)) return props || {};
    return {
        ...(props || {}),
        virtualStationId: id,
        id: realStationId || id
    };
};

export const getLineIdFromStationId = (stationId) => {
    const id = toText(stationId);
    if (!id) return '';
    const parts = id.split('.').map(toText).filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '';
};

const getStationTailToken = (stationId) => {
    const id = toText(stationId);
    if (!id) return '';
    const parts = id.split('.').map(toText).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : id;
};

const normalizeGroupChunks = (group) => {
    if (!Array.isArray(group)) return [];
    return group
        .map((chunk) => (Array.isArray(chunk) ? chunk.map(toText).filter(Boolean) : []))
        .filter((chunk) => chunk.length);
};

const flattenGroupIds = (group) => normalizeGroupChunks(group).flat();

const buildGroupIndex = (stationGroups, stationFeatures = []) => {
    const groupByStationId = new Map();
    const idsByGroupKey = new Map();
    for (const rawGroup of Array.isArray(stationGroups) ? stationGroups : []) {
        const ids = flattenGroupIds(rawGroup).filter((id) => !isPreviewVirtualStationId(id));
        if (ids.length < 2) continue;
        const groupKey = ids.slice().sort().join('|');
        if (!groupKey) continue;
        idsByGroupKey.set(groupKey, ids);
        for (const id of ids) {
            if (!groupByStationId.has(id)) groupByStationId.set(id, groupKey);
        }
    }
    for (const feature of Array.isArray(stationFeatures) ? stationFeatures : []) {
        const id = getFeatureId(feature);
        if (!id || isPreviewVirtualStationId(id) || groupByStationId.has(id)) continue;
        const groupKey = `__preview_single__:${id}`;
        groupByStationId.set(id, groupKey);
        idsByGroupKey.set(groupKey, [id]);
    }
    return { groupByStationId, idsByGroupKey };
};

const getFeatureId = (feature) => toText(feature?.properties?.id || feature?.id);

const getFeatureCoord = (feature) => {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
};

const getFeatureLineIds = (feature) => {
    const props = feature?.properties || {};
    return Array.from(new Set([
        ...normalizeArrayLike(props.platform_line_id),
        ...normalizeArrayLike(props.serving_ids),
        getLineIdFromStationId(getFeatureId(feature))
    ].filter(Boolean)));
};

const normalizeSelectionEntry = (rawEntry) => {
    if (Array.isArray(rawEntry) && rawEntry.length >= 2) {
        const entry = rawEntry[1] && typeof rawEntry[1] === 'object' ? rawEntry[1] : {};
        return { ...entry, key: toText(rawEntry[0]) };
    }
    return rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
};

const normalizeTripList = (payload) => (
    Array.isArray(payload?.virtualTrips) && payload.virtualTrips.length
        ? payload.virtualTrips
        : [payload]
);

const collectSegmentStationIds = (tripOrPayload) => {
    const out = [];
    const seen = new Set();
    const segments = Array.isArray(tripOrPayload?.segments) ? tripOrPayload.segments : [];
    for (const segment of segments) {
        const stationIds = Array.isArray(segment?.stationIds) ? segment.stationIds : [];
        for (const rawId of stationIds) {
            const id = toText(rawId);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
    }
    return out;
};

const resolveThroughConfigFromSource = (source, throughServiceConfigsObject) => {
    const raw = toText(source);
    if (!raw.startsWith('rw-menu-through:')) return null;
    const lineId = raw.slice('rw-menu-through:'.length).trim();
    if (!lineId) return null;

    for (const [category, info] of Object.entries(throughServiceConfigsObject || {})) {
        if (!info) continue;
        const ids = [
            info.lineId,
            ...(Array.isArray(info.segmentLineIds) ? info.segmentLineIds : [])
        ].map(toText).filter(Boolean);
        if (ids.includes(lineId)) return { category: toText(category), info };
    }
    return null;
};

const resolveTripParticipant = ({ entry, trip, throughServiceConfigsObject } = {}) => {
    const source = toText(entry?.source || trip?.previewSource || trip?.__previewSource);
    const through = resolveThroughConfigFromSource(source, throughServiceConfigsObject);
    const lineId = toText(trip?.selectedLineId || trip?.mainLineId || trip?.lineId || trip?.r);
    const participantKey = through
        ? `through:${through.category}`
        : (lineId ? `base-line:${lineId}` : source);
    if (!participantKey) return null;

    return {
        participantKey,
        source,
        lineId: lineId || toText(through?.info?.segmentLineIds?.[0]),
        throughCategory: toText(through?.category),
        throughStationIds: toSet(through?.info?.stations),
        name: toText(trip?.selectedLineName || trip?.lineName || trip?.mainLineName || through?.info?.lineName || lineId || source)
    };
};

const getCandidateStationIdsForParticipant = ({ participant, payloadStationIds } = {}) => {
    const payloadIds = Array.isArray(payloadStationIds) ? payloadStationIds.map(toText).filter(Boolean) : [];
    if (!(participant?.throughStationIds instanceof Set) || !participant.throughStationIds.size) return payloadIds;
    const intersection = payloadIds.filter((id) => participant.throughStationIds.has(id));
    if (!intersection.length) return Array.from(participant.throughStationIds);

    const out = intersection.slice();
    const seen = new Set(out);
    for (const id of participant.throughStationIds) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
};

const getVirtualStationId = ({ participantKey, realStationId }) => (
    `${VIRTUAL_STATION_PREFIX}:${participantKey}:${realStationId}`
);

const getStationNameFromFeature = (feature, fallbackId) => {
    const props = feature?.properties || {};
    const title = props.title || props.name || {};
    if (typeof title === 'string') return toText(title) || fallbackId;
    return toText(title['zh-Hans'] || title.zh || title.ja || title.en || props.name_zh || props.name || getStationTailToken(fallbackId)) || fallbackId;
};

const addParticipant = (participantsByGroupKey, groupKey, participant) => {
    if (!groupKey || !participant?.participantKey || !participant?.realStationId) return;
    if (!participantsByGroupKey.has(groupKey)) participantsByGroupKey.set(groupKey, new Map());
    const byKey = participantsByGroupKey.get(groupKey);
    if (!byKey.has(participant.participantKey)) byKey.set(participant.participantKey, participant);
};

const addBaseLinePeers = ({
    baseSelectedLineIds,
    groupKey,
    idsByGroupKey,
    participantsByGroupKey,
    stationFeatureById
}) => {
    if (!(baseSelectedLineIds instanceof Set) || !baseSelectedLineIds.size) return;
    for (const stationId of idsByGroupKey.get(groupKey) || []) {
        const lineId = getLineIdFromStationId(stationId);
        if (!lineId || !baseSelectedLineIds.has(lineId)) continue;
        const feature = stationFeatureById.get(stationId);
        if (!feature) continue;
        addParticipant(participantsByGroupKey, groupKey, {
            participantKey: `base-line:${lineId}`,
            source: `base-line:${lineId}`,
            lineId,
            realStationId: stationId,
            name: getStationNameFromFeature(feature, stationId)
        });
    }
};

const buildVirtualFeature = ({ feature, participant, coordinate, getLineColor }) => {
    const realStationId = participant.realStationId;
    const virtualId = getVirtualStationId({
        participantKey: participant.participantKey,
        realStationId
    });
    const lineId = toText(participant.lineId) || getLineIdFromStationId(realStationId);
    const baseLineIds = lineId ? [lineId] : getFeatureLineIds(feature).slice(0, 1);
    const baseProps = feature?.properties || {};

    return {
        ...(feature || {}),
        id: virtualId,
        geometry: {
            type: 'Point',
            coordinates: coordinate
        },
        properties: {
            ...baseProps,
            id: virtualId,
            realStationId,
            participantKey: participant.participantKey,
            participantSource: participant.source || participant.participantKey,
            throughCategory: participant.throughCategory || '',
            virtual_preview_station: 1,
            platform_line_id: baseLineIds,
            serving_ids: baseLineIds,
            color: toText(getLineColor?.(lineId, participant) || '')
        }
    };
};

export const buildPreviewVirtualStationInjection = ({
    baseSelectedLineIds,
    getLineColor = () => '',
    resolveStationCoordinate,
    stationGroups,
    stationsData,
    throughServiceConfigsObject,
    tripPreviewSelectionEntries,
    visibleStationIds
} = {}) => {
    const sourceFeatures = Array.isArray(stationsData?.features)
        ? stationsData.features.filter((feature) => feature?.properties?.virtual_preview_station !== 1 && !isPreviewVirtualStationId(getFeatureId(feature)))
        : [];
    const stationFeatureById = new Map();
    for (const feature of sourceFeatures) {
        const id = getFeatureId(feature);
        if (id) stationFeatureById.set(id, feature);
    }

    const { groupByStationId, idsByGroupKey } = buildGroupIndex(stationGroups, sourceFeatures);
    const selectedBaseLineIds = toSet(baseSelectedLineIds);
    const participantsByGroupKey = new Map();
    const originalVisibleStationIds = visibleStationIds instanceof Set
        ? new Set(Array.from(visibleStationIds).map(toText).filter(Boolean))
        : null;

    for (const rawEntry of Array.isArray(tripPreviewSelectionEntries) ? tripPreviewSelectionEntries : []) {
        const entry = normalizeSelectionEntry(rawEntry);
        if (entry?.hidden === true) continue;
        const payload = entry?.payload || {};
        for (const trip of normalizeTripList(payload)) {
            const participant = resolveTripParticipant({ entry, trip, throughServiceConfigsObject });
            if (!participant) continue;
            const payloadStationIds = collectSegmentStationIds(trip);
            const candidateStationIds = getCandidateStationIdsForParticipant({ participant, payloadStationIds });
            for (const stationId of candidateStationIds) {
                const groupKey = groupByStationId.get(stationId);
                const feature = stationFeatureById.get(stationId);
                if (!groupKey || !feature) continue;
                addParticipant(participantsByGroupKey, groupKey, {
                    ...participant,
                    realStationId: stationId,
                    name: participant.name || getStationNameFromFeature(feature, stationId)
                });
                addBaseLinePeers({
                    baseSelectedLineIds: selectedBaseLineIds,
                    groupKey,
                    idsByGroupKey,
                    participantsByGroupKey,
                    stationFeatureById
                });
            }
        }
    }

    const virtualFeatures = [];
    const virtualGroups = [];
    const replacedRealStationIds = new Set();
    const virtualStationIds = new Set();

    for (const [groupKey, byParticipantKey] of participantsByGroupKey.entries()) {
        const realGroupIds = idsByGroupKey.get(groupKey) || [];
        const groupIsVisible = !originalVisibleStationIds
            || realGroupIds.some((id) => originalVisibleStationIds.has(id));
        if (!groupIsVisible) continue;

        const participants = Array.from(byParticipantKey.values())
            .filter((participant) => stationFeatureById.has(participant.realStationId))
            .sort((a, b) => a.participantKey.localeCompare(b.participantKey));
        if (participants.length < 2) continue;

        const groupChunks = [];
        for (const participant of participants) {
            const feature = stationFeatureById.get(participant.realStationId);
            const baseCoord = getFeatureCoord(feature);
            if (!baseCoord) continue;
            const coordinate = (() => {
                if (typeof resolveStationCoordinate !== 'function') return baseCoord;
                try {
                    const resolved = resolveStationCoordinate({
                        ...participant,
                        baseCoord,
                        groupKey
                    });
                    const lng = Number(resolved?.[0]);
                    const lat = Number(resolved?.[1]);
                    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : baseCoord;
                } catch {
                    return baseCoord;
                }
            })();
            const virtualFeature = buildVirtualFeature({
                feature,
                participant,
                coordinate,
                getLineColor
            });
            const virtualId = getFeatureId(virtualFeature);
            if (!virtualId) continue;
            virtualFeatures.push(virtualFeature);
            virtualStationIds.add(virtualId);
            replacedRealStationIds.add(participant.realStationId);
            groupChunks.push([virtualId]);
        }

        if (groupChunks.length >= 2) {
            virtualGroups.push(groupChunks);
            for (const id of realGroupIds) replacedRealStationIds.add(id);
        } else {
            for (const chunk of groupChunks) virtualStationIds.delete(chunk[0]);
        }
    }

    const nextVisibleStationIds = originalVisibleStationIds ? new Set(originalVisibleStationIds) : null;
    if (nextVisibleStationIds) {
        for (const id of replacedRealStationIds) nextVisibleStationIds.delete(id);
        for (const id of virtualStationIds) nextVisibleStationIds.add(id);
    }

    return {
        stationsData: {
            ...(stationsData || {}),
            type: 'FeatureCollection',
            features: [
                ...sourceFeatures,
                ...virtualFeatures.filter((feature) => virtualStationIds.has(getFeatureId(feature)))
            ]
        },
        stationGroups: [
            ...(Array.isArray(stationGroups) ? stationGroups : []),
            ...virtualGroups
        ],
        visibleStationIds: nextVisibleStationIds,
        virtualStationIds,
        replacedRealStationIds,
        virtualGroups
    };
};

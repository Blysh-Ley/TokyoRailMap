const fallbackNormalizeText = (value) => String(value ?? '').trim();

const uniqueSeeds = (values, fallbackValue, normalizeText) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const source = Array.isArray(values) && values.length
        ? values.map((x) => normalize(x)).filter(Boolean)
        : (fallbackValue ? [normalize(fallbackValue)] : []);
    return Array.from(new Set(source)).slice(0, 3);
};

export const normalizeJourneyComputeInput = ({
    destinationCandidateIds,
    destinationId,
    destinationInputStationId,
    normalizeText,
    originCandidateIds,
    originId,
    originInputStationId
} = {}) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const resolvedOriginId = normalize(originId || originInputStationId || '');
    const resolvedDestinationId = normalize(destinationId || destinationInputStationId || '');
    const originSeeds = uniqueSeeds(originCandidateIds, resolvedOriginId, normalize);
    const destinationSeeds = uniqueSeeds(destinationCandidateIds, resolvedDestinationId, normalize);
    const hasOriginCandidates = Array.isArray(originCandidateIds) && originCandidateIds.length > 0;
    const hasDestinationCandidates = Array.isArray(destinationCandidateIds) && destinationCandidateIds.length > 0;
    const isOriginCoordinatePick = !resolvedOriginId && hasOriginCandidates;
    const isDestinationCoordinatePick = !resolvedDestinationId && hasDestinationCandidates;

    return {
        bothCoordinatePicks: isOriginCoordinatePick && isDestinationCoordinatePick,
        bothStationPicks: Boolean(resolvedOriginId && resolvedDestinationId),
        coordinateMode: isOriginCoordinatePick || isDestinationCoordinatePick,
        destinationId: resolvedDestinationId,
        destinationSeeds,
        isDestinationCoordinatePick,
        isOriginCoordinatePick,
        originId: resolvedOriginId,
        originSeeds
    };
};

export const createJourneyComputeKey = ({
    departureMs,
    destinationSeeds,
    originSeeds,
    serviceDay
} = {}) => `${(originSeeds || []).join('|')}||${(destinationSeeds || []).join('|')}||${serviceDay || ''}||${Math.floor((Number(departureMs) || 0) / 60000)}`;

export const getMissingJourneySeedState = ({
    destinationInputText,
    destinationSeeds,
    normalizeText,
    originInputText,
    originSeeds
} = {}) => {
    if ((originSeeds || []).length && (destinationSeeds || []).length) return null;
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const hasOriginText = !!normalize(originInputText);
    const hasDestinationText = !!normalize(destinationInputText);

    if (!hasOriginText && !hasDestinationText) {
        return { action: 'hide-if-empty' };
    }
    if (hasOriginText && hasDestinationText) {
        return {
            action: 'show-message',
            message: '2公里内未找到可用站点'
        };
    }
    return { action: 'noop' };
};

export const getCandidateWalkMinutes = ({
    candidateMeta,
    normalizeText,
    stationId
} = {}) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const stationKey = normalize(stationId);
    const meta = (Array.isArray(candidateMeta) ? candidateMeta : [])
        .find((item) => normalize(item?.stationId) === stationKey);
    return Number.isFinite(Number(meta?.walkMinutes)) ? Number(meta.walkMinutes) : null;
};

export const prepareOriginStopSet = ({
    filterNearbyStops,
    getGroupStops,
    originStationId,
    radiusMeters = 800
} = {}) => {
    if (typeof getGroupStops !== 'function') return null;
    const stationId = fallbackNormalizeText(originStationId);
    if (!stationId) return null;

    let sourceStops = getGroupStops(stationId);
    if (!(sourceStops instanceof Set)) sourceStops = new Set(sourceStops || []);
    sourceStops.add(stationId);

    if (typeof filterNearbyStops === 'function') {
        sourceStops = filterNearbyStops(stationId, sourceStops, radiusMeters);
    }

    return sourceStops instanceof Set && sourceStops.size ? sourceStops : null;
};

export const prepareDestinationStopSet = ({
    destinationStationId,
    getGroupStops,
    sameSet,
    sourceStops
} = {}) => {
    if (typeof getGroupStops !== 'function') return null;
    const stationId = fallbackNormalizeText(destinationStationId);
    if (!stationId) return null;

    const destinationStops = getGroupStops(stationId);
    const normalizedStops = destinationStops instanceof Set
        ? destinationStops
        : new Set(destinationStops || []);
    normalizedStops.add(stationId);

    if (!normalizedStops.size) return null;
    if (typeof sameSet === 'function' && sameSet(sourceStops, normalizedStops)) return null;
    return normalizedStops;
};

export const createJourneyPairPlanRequest = ({
    baseDepartureMs,
    destinationCandidateMeta,
    destinationStationId,
    getGroupStops,
    normalizeText,
    originCandidateMeta,
    originStationId,
    sameSet,
    serviceDay,
    sourceStops
} = {}) => {
    const originKey = fallbackNormalizeText(originStationId);
    const destinationKey = fallbackNormalizeText(destinationStationId);
    if (!originKey || !destinationKey || originKey === destinationKey) return null;

    const destinationStops = prepareDestinationStopSet({
        destinationStationId: destinationKey,
        getGroupStops,
        sameSet,
        sourceStops
    });
    if (!destinationStops) return null;

    const originWalkMin = getCandidateWalkMinutes({
        candidateMeta: originCandidateMeta,
        normalizeText,
        stationId: originKey
    });
    const destWalkMin = getCandidateWalkMinutes({
        candidateMeta: destinationCandidateMeta,
        normalizeText,
        stationId: destinationKey
    });

    return {
        baseDepartureMs,
        destWalkMin,
        destinationStationId: destinationKey,
        destinationStops,
        originStationId: originKey,
        originWalkMin,
        serviceDay,
        sourceStops
    };
};

export const collectJourneyCandidatePlans = async ({
    collectPlans,
    request
} = {}) => {
    if (typeof collectPlans !== 'function' || !request) return [];
    const plans = await collectPlans({
        sourceStops: request.sourceStops,
        destinationStops: request.destinationStops,
        serviceDay: request.serviceDay,
        baseDepartureMs: request.baseDepartureMs,
        originWalkMin: request.originWalkMin,
        destWalkMin: request.destWalkMin
    });
    return Array.isArray(plans) ? plans : [];
};

export const pickShortestJourneyPlan = (plans) => (
    Array.isArray(plans)
        ? plans.slice().sort((a, b) => a.durationMs - b.durationMs || a.transfers - b.transfers || a.arrivalMs - b.arrivalMs)[0] || null
        : null
);

export const applyJourneyWalkMetadata = ({
    destWalkMin,
    originWalkMin,
    plan
} = {}) => {
    if (!plan) return null;
    plan.__walkOriginMinutes = Number.isFinite(Number(originWalkMin))
        ? Number(originWalkMin)
        : (Number.isFinite(Number(plan.__walkOriginMinutes)) ? plan.__walkOriginMinutes : 0);
    plan.__walkDestinationMinutes = Number.isFinite(Number(destWalkMin))
        ? Number(destWalkMin)
        : (Number.isFinite(Number(plan.__walkDestinationMinutes)) ? plan.__walkDestinationMinutes : 0);
    return plan;
};

export const appendStationModeBestPlans = ({
    pairBestPlans,
    pickPlanBuckets,
    plans
} = {}) => {
    if (!Array.isArray(pairBestPlans) || !Array.isArray(plans)) return;
    try {
        const buckets = typeof pickPlanBuckets === 'function' ? pickPlanBuckets(plans) || [] : [];
        for (const bucket of buckets) {
            if (bucket?.plan) pairBestPlans.push(bucket.plan);
        }
    } catch {
        for (const plan of plans) pairBestPlans.push(plan);
    }
};

export const appendJourneyPairPlans = ({
    coordinateMode = false,
    destWalkMin,
    destinationStationId,
    originStationId,
    originWalkMin,
    pairBestPlans,
    pairBestWrappers,
    pickPlanBuckets,
    plans
} = {}) => {
    if (!Array.isArray(pairBestPlans) || !Array.isArray(plans) || !plans.length) return;

    if (coordinateMode) {
        const shortestPlan = pickShortestJourneyPlan(plans);
        if (!shortestPlan) return;

        applyJourneyWalkMetadata({
            destWalkMin,
            originWalkMin,
            plan: shortestPlan
        });

        pairBestPlans.push(shortestPlan);
        if (Array.isArray(pairBestWrappers)) {
            pairBestWrappers.push({
                plan: shortestPlan,
                originStationId,
                destinationStationId,
                originWalkMin: shortestPlan.__walkOriginMinutes,
                destWalkMin: shortestPlan.__walkDestinationMinutes
            });
        }
        return;
    }

    appendStationModeBestPlans({
        pairBestPlans,
        pickPlanBuckets,
        plans
    });
};

export const createPickedJourneyRows = ({
    bestPlanBuckets,
    departureMs,
    destinationId,
    destinationInputText,
    destinationSeeds,
    getStationNameById,
    normalizeText,
    originId,
    originInputText,
    originSeeds,
    pairBestWrappers,
    serviceDay
} = {}) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const wrappers = Array.isArray(pairBestWrappers) ? pairBestWrappers : [];
    const getStationName = typeof getStationNameById === 'function' ? getStationNameById : () => '';
    const resolvePlanEndpointIds = (plan) => {
        const legs = Array.isArray(plan?.legs) ? plan.legs : [];
        const firstLeg = legs.find((leg) => normalize(leg?.fromStop));
        const lastLeg = legs.slice().reverse().find((leg) => normalize(leg?.toStop));
        return {
            originStationId: normalize(firstLeg?.fromStop || ''),
            destinationStationId: normalize(lastLeg?.toStop || '')
        };
    };

    return (Array.isArray(bestPlanBuckets) ? bestPlanBuckets : []).slice(0, 3).map((bucket, idx) => {
        const plan = bucket?.plan || null;
        const tagLabels = [normalize(bucket?.label || `方案${idx + 1}`) || `方案${idx + 1}`];
        if (plan?.hasSurcharge) tagLabels.push('额外费用！');

        const wrapper = wrappers.find((item) => item.plan === plan) || {};
        const planEndpointIds = resolvePlanEndpointIds(plan);
        const originStationResolved = planEndpointIds.originStationId || wrapper.originStationId || originId || (originSeeds?.[0] || '');
        const destinationStationResolved = planEndpointIds.destinationStationId || wrapper.destinationStationId || destinationId || (destinationSeeds?.[0] || '');

        return {
            ...bucket,
            tagLabels,
            serviceDay,
            baseDepartureMs: departureMs,
            originStationId: originStationResolved,
            destinationStationId: destinationStationResolved,
            originName: normalize(originInputText) || (originSeeds || []).map(getStationName).find(Boolean) || originInputText,
            destinationName: normalize(destinationInputText) || (destinationSeeds || []).map(getStationName).find(Boolean) || destinationInputText,
            __walkOriginMinutes: Number.isFinite(Number(wrapper.originWalkMin))
                ? Number(wrapper.originWalkMin)
                : (Number.isFinite(Number(plan?.__walkOriginMinutes)) ? Number(plan.__walkOriginMinutes) : 0),
            __walkDestinationMinutes: Number.isFinite(Number(wrapper.destWalkMin))
                ? Number(wrapper.destWalkMin)
                : (Number.isFinite(Number(plan?.__walkDestinationMinutes)) ? Number(plan.__walkDestinationMinutes) : 0)
        };
    });
};

export const createPickedJourneyResultRows = ({
    departureMs,
    destinationId,
    destinationInputText,
    destinationSeeds,
    getStationNameById,
    normalizeText,
    originId,
    originInputText,
    originSeeds,
    pairBestPlans,
    pairBestWrappers,
    pickPlanBuckets,
    serviceDay
} = {}) => {
    const bestPlanBuckets = typeof pickPlanBuckets === 'function'
        ? pickPlanBuckets(Array.isArray(pairBestPlans) ? pairBestPlans : [])
        : [];
    return createPickedJourneyRows({
        bestPlanBuckets,
        departureMs,
        destinationId,
        destinationInputText,
        destinationSeeds,
        getStationNameById,
        normalizeText,
        originId,
        originInputText,
        originSeeds,
        pairBestWrappers,
        serviceDay
    });
};

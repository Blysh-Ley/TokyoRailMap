const fallbackNormalizeText = (value) => String(value ?? '').trim();
const MAX_JOURNEY_WAIT_MINUTES = 120;

const normalizeJourneyWaitMinutes = (value) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.max(0, Math.min(MAX_JOURNEY_WAIT_MINUTES, Math.round(minutes)));
};

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

export const createWaypointJourneyComputeKey = ({
    departureMs,
    endpoints,
    serviceDay
} = {}) => {
    const endpointKey = (Array.isArray(endpoints) ? endpoints : []).map((endpoint) => {
        const seedText = Array.isArray(endpoint?.candidateIds) && endpoint.candidateIds.length
            ? endpoint.candidateIds.join(',')
            : fallbackNormalizeText(endpoint?.stationId || endpoint?.inputStationId || '');
        const lng = Number(endpoint?.lngLat?.lng);
        const lat = Number(endpoint?.lngLat?.lat);
        const coordText = Number.isFinite(lng) && Number.isFinite(lat)
            ? `${lng.toFixed(6)},${lat.toFixed(6)}`
            : '';
        const waitText = normalizeJourneyWaitMinutes(endpoint?.waitMinutes);
        return `${fallbackNormalizeText(endpoint?.role || '')}:${seedText}:${coordText}:${fallbackNormalizeText(endpoint?.inputText || '')}:wait=${waitText}`;
    }).join('>');
    return `${endpointKey}||${serviceDay || ''}||${Math.floor((Number(departureMs) || 0) / 60000)}`;
};

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

const getEndpointDisplayName = ({
    endpoint,
    getStationNameById,
    normalizeText
} = {}) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const getStationName = typeof getStationNameById === 'function' ? getStationNameById : () => '';
    const seeds = Array.isArray(endpoint?.seeds) ? endpoint.seeds : [];
    return normalize(endpoint?.inputText)
        || seeds.map(getStationName).map(normalize).find(Boolean)
        || normalize(endpoint?.label)
        || '';
};

const createCombinedWaypointPlan = ({
    departureMs,
    segmentRows
} = {}) => {
    const rows = Array.isArray(segmentRows) ? segmentRows.filter(Boolean) : [];
    const legs = rows.flatMap((row) => Array.isArray(row?.plan?.legs) ? row.plan.legs : []);
    const sections = rows.flatMap((row) => Array.isArray(row?.plan?.sections) ? row.plan.sections : []);
    const firstPlan = rows[0]?.plan || null;
    const lastPlan = rows[rows.length - 1]?.plan || null;
    const firstDepMs = Number.isFinite(Number(firstPlan?.firstDepMs))
        ? Number(firstPlan.firstDepMs)
        : (Number.isFinite(Number(departureMs)) ? Number(departureMs) : null);
    const arrivalMs = Number.isFinite(Number(lastPlan?.arrivalMs)) ? Number(lastPlan.arrivalMs) : null;
    const baseDepartureMs = Number.isFinite(Number(departureMs))
        ? Number(departureMs)
        : (Number.isFinite(Number(firstPlan?.baseDepartureMs)) ? Number(firstPlan.baseDepartureMs) : firstDepMs);
    const summedDurationMs = rows.reduce((sum, row) => {
        const value = Number(row?.plan?.durationMs);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const durationMs = Number.isFinite(Number(arrivalMs)) && Number.isFinite(Number(baseDepartureMs))
        ? Number(arrivalMs) - Number(baseDepartureMs)
        : summedDurationMs;
    const transfers = rows.reduce((sum, row) => {
        const value = Number(row?.plan?.transfers);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    return {
        baseDepartureMs,
        durationMs,
        firstDepMs,
        arrivalMs,
        legs,
        sections,
        transfers,
        hasSurcharge: rows.some((row) => row?.plan?.hasSurcharge === true)
    };
};

export const createWaypointJourneyResultRow = ({
    departureMs,
    endpoints,
    getStationNameById,
    isPartial = false,
    normalizeText,
    segmentRows,
    serviceDay
} = {}) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const rows = Array.isArray(segmentRows) ? segmentRows.filter(Boolean) : [];
    const endpointList = Array.isArray(endpoints) ? endpoints : [];
    const originEndpoint = endpointList[0] || {};
    const destinationEndpoint = endpointList[endpointList.length - 1] || {};
    const waypointEndpoints = endpointList.slice(1, Math.max(1, endpointList.length - 1));
    const originName = getEndpointDisplayName({ endpoint: originEndpoint, getStationNameById, normalizeText: normalize });
    const destinationName = getEndpointDisplayName({ endpoint: destinationEndpoint, getStationNameById, normalizeText: normalize });
    const waypointNames = waypointEndpoints.map((endpoint, index) => (
        getEndpointDisplayName({ endpoint, getStationNameById, normalizeText: normalize }) || `途径点 ${index + 1}`
    ));
    const waitMinutesByEndpoint = endpointList.map((endpoint) => normalizeJourneyWaitMinutes(endpoint?.waitMinutes));
    const totalWaitMinutes = waitMinutesByEndpoint.reduce((sum, minutes) => sum + minutes, 0);
    const waypointStationIds = waypointEndpoints.map((endpoint, index) => normalize(
        endpoint.stationId
        || endpoint.inputStationId
        || endpoint.seeds?.[0]
        || rows[index]?.destinationStationId
        || ''
    ));
    const completedCount = rows.length;
    const totalCount = Math.max(0, endpointList.length - 1);
    const segments = rows.map((row, index) => {
        const fromEndpoint = endpointList[index] || {};
        const toEndpoint = endpointList[index + 1] || {};
        return {
            index,
            fromName: getEndpointDisplayName({ endpoint: fromEndpoint, getStationNameById, normalizeText: normalize }) || row.originName || `第 ${index + 1} 段起点`,
            toName: getEndpointDisplayName({ endpoint: toEndpoint, getStationNameById, normalizeText: normalize }) || row.destinationName || `第 ${index + 1} 段终点`,
            row
        };
    });

    const combinedPlan = createCombinedWaypointPlan({ departureMs, segmentRows: rows });
    const finalDestinationSeed = normalize(
        destinationEndpoint.stationId
        || destinationEndpoint.inputStationId
        || destinationEndpoint.seeds?.[0]
        || rows[rows.length - 1]?.destinationStationId
        || ''
    );

    return {
        kind: 'waypointJourney',
        label: isPartial ? `已完成 ${completedCount}/${totalCount} 段` : '途径点路线',
        tagLabels: [isPartial ? `计算中 ${completedCount}/${totalCount}` : '途径点路线'],
        serviceDay,
        baseDepartureMs: departureMs,
        originStationId: rows[0]?.originStationId || normalize(originEndpoint.stationId || originEndpoint.inputStationId || originEndpoint.seeds?.[0] || ''),
        destinationStationId: finalDestinationSeed,
        originName,
        destinationName,
        waypointNames,
        waypointStationIds,
        waitMinutesByEndpoint,
        totalWaitMinutes,
        planSummary: {
            completedCount,
            totalCount,
            isPartial
        },
        segments,
        plan: combinedPlan
    };
};

export const computeWaypointJourneySegments = async ({
    collectPlans,
    departureMs,
    endpoints,
    filterNearbyStops,
    getGroupStops,
    getStationNameById,
    isCancelled,
    normalizeText,
    onSegmentComplete,
    sameSet,
    serviceDay,
    shouldBlockJourneyPlanning
} = {}) => {
    const normalize = typeof normalizeText === 'function' ? normalizeText : fallbackNormalizeText;
    const endpointList = (Array.isArray(endpoints) ? endpoints : []).map((endpoint) => ({
        ...endpoint,
        inputStationId: normalize(endpoint?.inputStationId || ''),
        stationId: normalize(endpoint?.stationId || ''),
        inputText: normalize(endpoint?.inputText || ''),
        waitMinutes: normalizeJourneyWaitMinutes(endpoint?.waitMinutes),
        candidateIds: Array.isArray(endpoint?.candidateIds)
            ? endpoint.candidateIds.map(normalize).filter(Boolean)
            : [],
        candidateMeta: Array.isArray(endpoint?.candidateMeta) ? endpoint.candidateMeta : []
    }));

    if (endpointList.length < 2) {
        return { errorMessage: '请填写起点和终点', rows: [] };
    }

    const segmentRows = [];
    let segmentDepartureMs = departureMs;

    for (let segmentIndex = 0; segmentIndex < endpointList.length - 1; segmentIndex += 1) {
        if (isCancelled?.()) return { cancelled: true, rows: segmentRows };

        const fromEndpoint = endpointList[segmentIndex];
        const toEndpoint = endpointList[segmentIndex + 1];
        const waitMs = normalizeJourneyWaitMinutes(fromEndpoint?.waitMinutes) * 60000;
        const segmentBaseDepartureMs = Number.isFinite(Number(segmentDepartureMs))
            ? Number(segmentDepartureMs) + waitMs
            : segmentDepartureMs;
        const {
            bothCoordinatePicks,
            bothStationPicks,
            coordinateMode,
            destinationId,
            destinationSeeds,
            originId,
            originSeeds
        } = normalizeJourneyComputeInput({
            destinationCandidateIds: toEndpoint.candidateIds,
            destinationId: toEndpoint.stationId,
            destinationInputStationId: toEndpoint.inputStationId,
            normalizeText: normalize,
            originCandidateIds: fromEndpoint.candidateIds,
            originId: fromEndpoint.stationId,
            originInputStationId: fromEndpoint.inputStationId
        });

        fromEndpoint.seeds = originSeeds;
        toEndpoint.seeds = destinationSeeds;

        const fromLabel = segmentIndex === 0 ? '起点' : `途径点 ${segmentIndex}`;
        const toLabel = segmentIndex === endpointList.length - 2 ? '终点' : `途径点 ${segmentIndex + 1}`;
        if (!originSeeds.length) return { errorMessage: `${fromLabel}附近未找到可用站点`, rows: segmentRows };
        if (!destinationSeeds.length) return { errorMessage: `${toLabel}附近未找到可用站点`, rows: segmentRows };

        const stationPickBlocked = bothStationPicks && shouldBlockJourneyPlanning?.({
            originStationId: originId,
            destinationStationId: destinationId
        });
        const coordinatePickBlocked = bothCoordinatePicks && shouldBlockJourneyPlanning?.({
            originLngLat: fromEndpoint.lngLat,
            destinationLngLat: toEndpoint.lngLat,
            maxDistanceMeters: 500
        });
        if (stationPickBlocked || coordinatePickBlocked) {
            return { errorMessage: '相邻站点不能相同', rows: segmentRows };
        }

        const segmentCandidates = [];
        for (const originStationId of originSeeds) {
            if (isCancelled?.()) return { cancelled: true, rows: segmentRows };

            const sourceStops = prepareOriginStopSet({
                filterNearbyStops,
                getGroupStops,
                originStationId,
                radiusMeters: 800
            });
            if (!sourceStops) continue;

            for (const destinationStationId of destinationSeeds) {
                if (isCancelled?.()) return { cancelled: true, rows: segmentRows };

                const pairRequest = createJourneyPairPlanRequest({
                    baseDepartureMs: segmentBaseDepartureMs,
                    destinationCandidateMeta: toEndpoint.candidateMeta,
                    destinationStationId,
                    getGroupStops,
                    normalizeText: normalize,
                    originCandidateMeta: fromEndpoint.candidateMeta,
                    originStationId,
                    sameSet,
                    serviceDay,
                    sourceStops
                });
                if (!pairRequest) continue;

                const plans = await collectJourneyCandidatePlans({
                    collectPlans,
                    request: pairRequest
                });
                if (!Array.isArray(plans) || !plans.length) continue;

                for (const plan of plans) {
                    applyJourneyWalkMetadata({
                        destWalkMin: pairRequest.destWalkMin,
                        originWalkMin: pairRequest.originWalkMin,
                        plan
                    });
                    segmentCandidates.push({
                        destinationStationId: pairRequest.destinationStationId,
                        destWalkMin: pairRequest.destWalkMin,
                        originStationId: pairRequest.originStationId,
                        originWalkMin: pairRequest.originWalkMin,
                        plan
                    });
                }
            }
        }

        if (isCancelled?.()) return { cancelled: true, rows: segmentRows };
        if (!segmentCandidates.length) {
            return { errorMessage: `第 ${segmentIndex + 1} 段无可用路线`, rows: segmentRows };
        }

        const bestPlan = pickShortestJourneyPlan(segmentCandidates.map((candidate) => candidate.plan));
        const bestWrapper = segmentCandidates.find((candidate) => candidate.plan === bestPlan) || segmentCandidates[0];
        const pickedRows = createPickedJourneyRows({
            bestPlanBuckets: [{ label: `第 ${segmentIndex + 1} 段`, plan: bestWrapper.plan }],
            departureMs: segmentBaseDepartureMs,
            destinationId,
            destinationInputText: toEndpoint.inputText || toEndpoint.label || toLabel,
            destinationSeeds,
            getStationNameById,
            normalizeText: normalize,
            originId,
            originInputText: fromEndpoint.inputText || fromEndpoint.label || fromLabel,
            originSeeds,
            pairBestWrappers: [bestWrapper],
            serviceDay
        });
        const segmentRow = pickedRows[0] || null;
        if (!segmentRow) {
            return { errorMessage: `第 ${segmentIndex + 1} 段无可用路线`, rows: segmentRows };
        }

        segmentRows.push(segmentRow);
        if (Number.isFinite(Number(bestWrapper.plan?.arrivalMs))) {
            segmentDepartureMs = Number(bestWrapper.plan.arrivalMs);
        }

        await onSegmentComplete?.({
            endpointList,
            isPartial: segmentRows.length < endpointList.length - 1,
            segmentIndex,
            segmentRows: segmentRows.slice()
        });
    }

    return { rows: segmentRows };
};

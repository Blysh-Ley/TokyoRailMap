import { getPairMapValue } from '../../domain/alternateLineMembership.js';

export const TRIP_PREVIEW_PAST_COLOR = '#b8bec8';
export const TRIP_PREVIEW_PAST_DARK_COLOR = '#3f454d';
const STATION_THROUGH_BRANCH_PREVIEW_SOURCE = 'station-through-branch';

export const resolveTripPreviewPastColor = ({ isDarkThemeActive = false } = {}) => (
    isDarkThemeActive === true ? TRIP_PREVIEW_PAST_DARK_COLOR : TRIP_PREVIEW_PAST_COLOR
);

export const createTripPreviewBuilder = ({
    stationCoordByIdBase,
    stationCoordById,
    stationServingCountById,
    lineColorById,
    alternateLineMembership = null,
    throughServiceConfigsObject = {},
    resolveRailColorForTheme,
    isLineTerminalStation,
    isSamePhysicalStation,
    isLoopDirection,
    extractLineSegment,
    nearestBridgeBetweenLines,
    distMeters,
    extendBBox,
    getLineOffsetUnits = () => 0,
    isTripPastDimmingEnabled = () => true,
    isDarkThemeActive = () => false,
    isDebugLoopEnabled
} = {}) => {
    const resolveAlternateStationId = (stationId, sourceLineId = '') => {
        const sid = String(stationId || '').trim();
        if (!sid) return '';
        const map = alternateLineMembership?.alternateStationIdByLineStationId;
        if (!map || typeof map.get !== 'function') return '';
        const direct = getPairMapValue(map, sourceLineId, sid);
        if (direct) return direct;
        for (const [key, value] of map.entries()) {
            const text = String(key || '');
            if (text.endsWith(`\u0000${sid}`)) return String(value || '').trim();
        }
        return '';
    };

    const getStationCoord = (stationId, sourceLineId = '', allowAlternate = false) => {
        const sid = String(stationId || '').trim();
        const coord = stationCoordByIdBase?.get(sid) || stationCoordById?.get(sid);
        if (coord) return coord;
        if (!allowAlternate) return null;
        const alternateStationId = resolveAlternateStationId(sid, sourceLineId);
        return alternateStationId
            ? (stationCoordByIdBase?.get(alternateStationId) || stationCoordById?.get(alternateStationId))
            : null;
    };

    const resolvePreviewStationId = (stationId, sourceLineId = '', allowAlternate = false) => {
        const sid = String(stationId || '').trim();
        if (!sid || !allowAlternate) return sid;
        return resolveAlternateStationId(sid, sourceLineId) || sid;
    };

    const getLineColor = (lineId) => {
        return lineColorById?.get(String(lineId || '')) || '';
    };

    const resolveLineOffsetUnits = (lineId) => {
        const n = Number(getLineOffsetUnits?.(String(lineId || '').trim()));
        return Number.isFinite(n) ? n : 0;
    };

    const resolveSegmentRouteLineId = (seg, fallbackLineId = '') => String(
        seg?.r
        || seg?.routeLineId
        || seg?.railwayId
        || seg?.geometryLineId
        || seg?.geometry_line_id
        || seg?.offsetLineId
        || seg?.line_offset_id
        || seg?.lineId
        || fallbackLineId
        || ''
    ).trim();

    const resolveSegmentGeometryLineId = (seg, fallbackLineId = '') => String(
        seg?.r
        || seg?.routeLineId
        || seg?.railwayId
        || seg?.geometryLineId
        || seg?.geometry_line_id
        || seg?.offsetLineId
        || seg?.line_offset_id
        || seg?.lineId
        || fallbackLineId
        || ''
    ).trim();

    const resolveSegmentOffsetLineId = (seg, geometryLineId = '') => String(
        seg?.r
        || seg?.routeLineId
        || seg?.railwayId
        || seg?.offsetLineId
        || seg?.line_offset_id
        || geometryLineId
        || seg?.geometryLineId
        || seg?.geometry_line_id
        || seg?.lineId
        || ''
    ).trim();

    const throughServiceHighlightColors = new Set(
        Object.values(throughServiceConfigsObject || {})
            .map((info) => String(info?.color || '').trim().toLowerCase())
            .filter(Boolean)
    );

    const isThroughServiceHighlightColor = (color) => {
        const normalized = String(color || '').trim().toLowerCase();
        return !!normalized && throughServiceHighlightColors.has(normalized);
    };

    const buildTripPreviewFeatures = (payload, context = {}) => {
        const outLineFeatures = [];
        const outStopFeatures = [];
        const coordsForBbox = [];
        const stopIds = new Set();
        const pastStopIds = new Set();
        const lineSegmentCache = context?.lineSegmentCache instanceof Map
            ? context.lineSegmentCache
            : null;
        const lineFeatureCache = context?.lineFeatureCache instanceof Map
            ? context.lineFeatureCache
            : null;
        const stopFeatureCache = context?.stopFeatureCache instanceof Map
            ? context.stopFeatureCache
            : null;
        const stationCoordCache = context?.stationCoordCache instanceof Map
            ? context.stationCoordCache
            : null;
        const servingCountCache = context?.servingCountCache instanceof Map
            ? context.servingCountCache
            : null;
        const lineOffsetUnitsCache = context?.lineOffsetUnitsCache instanceof Map
            ? context.lineOffsetUnitsCache
            : null;
        const debugLoop = !!isDebugLoopEnabled?.();
        const previewSource = String(payload?.previewSource || payload?.__previewSource || '').trim();
        const usePanelAlternateTripPreview = previewSource === 'panel-trip'
            || previewSource === STATION_THROUGH_BRANCH_PREVIEW_SOURCE;
        const getTripStationCoord = (stationId, lineId = '', useAlternate = usePanelAlternateTripPreview) => {
            const sid = String(stationId || '').trim();
            if (!sid) return null;
            if (!(stationCoordCache instanceof Map)) {
                return getStationCoord(sid, lineId, useAlternate);
            }
            const key = [
                sid,
                String(lineId || '').trim(),
                useAlternate === true ? 'alt' : 'base'
            ].join('||');
            if (!stationCoordCache.has(key)) {
                stationCoordCache.set(key, getStationCoord(sid, lineId, useAlternate));
            }
            return stationCoordCache.get(key);
        };
        const getServingCount = (stationId) => {
            const sid = String(stationId || '').trim();
            if (!sid) return 1;
            if (!(servingCountCache instanceof Map)) {
                return Number(stationServingCountById?.get(sid) || 1);
            }
            if (!servingCountCache.has(sid)) {
                servingCountCache.set(sid, Number(stationServingCountById?.get(sid) || 1));
            }
            return servingCountCache.get(sid);
        };
        const resolveLineOffsetUnitsCached = (lineId) => {
            const id = String(lineId || '').trim();
            if (!(lineOffsetUnitsCache instanceof Map)) return resolveLineOffsetUnits(id);
            if (!lineOffsetUnitsCache.has(id)) {
                lineOffsetUnitsCache.set(id, resolveLineOffsetUnits(id));
            }
            return lineOffsetUnitsCache.get(id);
        };

        const allSegments = Array.isArray(payload?.segments) ? payload.segments : [];
        const ntSeg = allSegments.find((s) => String(s?.kind) === 'nt') || null;
        const ntFirstStationId = (() => {
            const ids = Array.isArray(ntSeg?.stationIds) ? ntSeg.stationIds : [];
            return ids.length ? String(ids[0] || '').trim() : '';
        })();

        const forceIncludeNt = payload?.forceIncludeNt === true || payload?.__forceIncludeNt === true;
        let allowNt = true;
        if (!forceIncludeNt) {
            allowNt = !payload?.hasNt || isLineTerminalStation?.(payload?.mainLineId, payload?.mainTerminalStationId);
            if (!allowNt && payload?.hasNt) {
                allowNt = !!isSamePhysicalStation?.(payload?.mainTerminalStationId, ntFirstStationId);
            }

            if (!allowNt && payload?.hasNt && ntSeg) {
                const mainTerminalId = String(payload?.mainTerminalStationId || '').trim();
                const mainTerminalCoord = getTripStationCoord(mainTerminalId, '', false);
                const ntFirstCoord = getTripStationCoord(ntFirstStationId, '', false);
                const ntLineId = resolveSegmentGeometryLineId(ntSeg, '');

                if (mainTerminalCoord && ntFirstCoord && ntLineId) {
                    const directDist = distMeters?.(mainTerminalCoord, ntFirstCoord);
                    if (directDist <= 8000) {
                        allowNt = true;
                    } else {
                        const mainSeg = allSegments.find((s) => String(s?.kind) === 'main') || {};
                        const mainLineId = resolveSegmentGeometryLineId(mainSeg, payload?.mainLineId);
                        const bridge = nearestBridgeBetweenLines?.(
                            mainLineId,
                            ntLineId,
                            mainTerminalCoord,
                            ntFirstCoord
                        );
                        allowNt = !!bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                    }
                }
            }
        }

        const segments = allowNt ? allSegments : allSegments.filter((s) => String(s?.kind) !== 'nt');
        const payloadTypeColor = String(payload?.typeColor || '').trim();
        const shouldDimPastTripStops = isTripPastDimmingEnabled?.() !== false;
        const pastColor = resolveTripPreviewPastColor({ isDarkThemeActive: isDarkThemeActive?.() === true });
        const getPastStationIdSet = (seg) => new Set(
            (shouldDimPastTripStops && Array.isArray(seg?.pastStationIds) ? seg.pastStationIds : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        );
        const getCurrentStationIdSet = (seg) => new Set(
            (shouldDimPastTripStops && Array.isArray(seg?.currentStationIds) ? seg.currentStationIds : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        );
        const hasPastStation = (ids, stationId) => (
            ids instanceof Set && ids.has(String(stationId || '').trim())
        );
        const hasCurrentStation = (ids, stationId) => (
            ids instanceof Set && ids.has(String(stationId || '').trim())
        );
        const resolveSegColor = (seg, fallbackLineId) => {
            const throughServiceColorRaw = String(seg?.throughServiceColor || '').trim();
            if (throughServiceColorRaw) {
                return resolveRailColorForTheme?.(throughServiceColorRaw) || throughServiceColorRaw;
            }
            const segTypeColorRaw = String(seg?.typeColor || payloadTypeColor).trim();
            if (isThroughServiceHighlightColor(segTypeColorRaw)) {
                return resolveRailColorForTheme?.(segTypeColorRaw) || segTypeColorRaw;
            }
            return resolveRailColorForTheme?.(getLineColor(fallbackLineId) || '') || '';
        };
        const resolvePairColor = (seg, fromStationId, toStationId, fallbackColor, fallbackLineId) => {
            if (!usePanelAlternateTripPreview) return fallbackColor;
            const map = alternateLineMembership?.highlightAlternateLineIdByLineStationId;
            if (!map || typeof map.get !== 'function') return fallbackColor;

            const candidateLineIds = Array.from(new Set([
                String(seg?.lineId || '').trim(),
                String(seg?.sourceLineId || '').trim(),
                String(seg?.r || seg?.routeLineId || seg?.railwayId || '').trim(),
                String(seg?.geometryLineId || seg?.geometry_line_id || '').trim(),
                String(fallbackLineId || '').trim()
            ].filter(Boolean)));

            for (const sourceLineId of candidateLineIds) {
                const fromAlternateLineId = getPairMapValue(map, sourceLineId, fromStationId);
                const toAlternateLineId = getPairMapValue(map, sourceLineId, toStationId);
                if (!fromAlternateLineId || fromAlternateLineId !== toAlternateLineId) continue;
                const alternateColor = resolveRailColorForTheme?.(getLineColor(fromAlternateLineId) || '') || '';
                if (alternateColor) return alternateColor;
            }
            return fallbackColor;
        };
        const resolvePairAlternateBoundary = (seg, fromStationId, toStationId, fallbackLineId) => {
            if (!usePanelAlternateTripPreview) return null;
            const rules = Array.isArray(alternateLineMembership?.rangeRules) ? alternateLineMembership.rangeRules : [];
            if (!rules.length) return null;
            const candidateLineIds = Array.from(new Set([
                String(seg?.lineId || '').trim(),
                String(seg?.sourceLineId || '').trim(),
                String(seg?.r || seg?.routeLineId || seg?.railwayId || '').trim(),
                String(seg?.geometryLineId || seg?.geometry_line_id || '').trim(),
                String(fallbackLineId || '').trim()
            ].filter(Boolean)));
            for (const sourceLineId of candidateLineIds) {
                for (const rule of rules) {
                    if (String(rule?.lineId || '').trim() !== sourceLineId) continue;
                    const membershipIds = new Set((Array.isArray(rule?.stationMembershipStationIds) ? rule.stationMembershipStationIds : []).map(String));
                    const fromIn = membershipIds.has(String(fromStationId || '').trim());
                    const toIn = membershipIds.has(String(toStationId || '').trim());
                    if (fromIn === toIn) continue;
                    const boundaryStationId = String((Array.isArray(rule?.boundaryExpansionStationIds) ? rule.boundaryExpansionStationIds : [])[0] || '').trim();
                    const alternateLineId = getPairMapValue(
                        alternateLineMembership?.alternateLineIdByLineStationId,
                        sourceLineId,
                        fromIn ? fromStationId : toStationId
                    ) || getPairMapValue(
                        alternateLineMembership?.highlightAlternateLineIdByLineStationId,
                        sourceLineId,
                        boundaryStationId
                    );
                    const alternateColor = resolveRailColorForTheme?.(getLineColor(alternateLineId) || '') || '';
                    const boundaryCoord = boundaryStationId ? getTripStationCoord(boundaryStationId, sourceLineId, true) : null;
                    if (!boundaryCoord || !alternateColor) continue;
                    return { alternateColor, alternateFromStart: fromIn, boundaryCoord };
                }
            }
            return null;
        };

        const splitCoordsAtBoundary = (coords, boundaryCoord) => {
            if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(boundaryCoord)) return null;
            let bestIndex = -1;
            let bestDistance = Infinity;
            for (let index = 0; index < coords.length; index += 1) {
                const distance = distMeters?.(coords[index], boundaryCoord);
                if (!Number.isFinite(distance) || distance >= bestDistance) continue;
                bestDistance = distance;
                bestIndex = index;
            }
            if (bestIndex < 0 || bestDistance > 500) return null;
            if (bestIndex === 0) return { first: null, second: coords };
            if (bestIndex === coords.length - 1) return { first: coords, second: null };
            return {
                first: coords.slice(0, bestIndex + 1),
                second: coords.slice(bestIndex)
            };
        };

        const coordKey = (coord) => (
            Array.isArray(coord) && coord.length >= 2
                ? `${Number(coord[0]) || 0},${Number(coord[1]) || 0}`
                : ''
        );
        const coordsKey = (coords) => (
            Array.isArray(coords)
                ? coords.map((coord) => coordKey(coord)).join('>')
                : ''
        );
        const getCachedLineSegment = (lineId, from, to, options = {}) => {
            const id = String(lineId || '').trim();
            if (!id || typeof extractLineSegment !== 'function') return null;
            if (!(lineSegmentCache instanceof Map)) {
                return extractLineSegment(id, from, to, options);
            }
            const key = [
                id,
                coordKey(from),
                coordKey(to),
                options?.preferLoopShortest === true ? 'short' : 'default',
                String(options?.direction || '').trim(),
                options?.preserveLineDirection === true ? 'preserve' : 'free'
            ].join('||');
            if (lineSegmentCache.has(key)) {
                return lineSegmentCache.get(key);
            }
            const clipped = extractLineSegment(id, from, to, options);
            lineSegmentCache.set(key, Array.isArray(clipped) ? clipped : null);
            return clipped;
        };

        const pushPairLineFeature = (coords, lineId, role, pairColor, options, alternateBoundary) => {
            const split = alternateBoundary ? splitCoordsAtBoundary(coords, alternateBoundary.boundaryCoord) : null;
            if (!split) {
                pushLineFeature(coords, lineId, role, pairColor, options);
                return;
            }
            const firstColor = alternateBoundary.alternateFromStart ? alternateBoundary.alternateColor : pairColor;
            const secondColor = alternateBoundary.alternateFromStart ? pairColor : alternateBoundary.alternateColor;
            if (split.first) pushLineFeature(split.first, lineId, role, firstColor, options);
            if (split.second) pushLineFeature(split.second, lineId, role, secondColor, options);
        };

        const pushLineFeature = (coords, lineId, role = 'line', colorOverride = '', options = {}) => {
            if (!Array.isArray(coords) || coords.length < 2) return;
            for (const c of coords) {
                if (Array.isArray(c) && c.length >= 2) coordsForBbox.push(c);
            }
            const routeLineId = String(options?.routeLineId || options?.r || options?.geometryLineId || lineId || '').trim();
            const geometryLineId = String(options?.geometryLineId || routeLineId || lineId || '').trim();
            const offsetLineId = String(options?.offsetLineId || routeLineId || geometryLineId || '').trim();
            const rawColor = String(colorOverride || '').trim()
                || resolveRailColorForTheme?.(getLineColor(lineId) || getLineColor(geometryLineId) || '#0a84ff')
                || '#0a84ff';
            const explicitOffsetUnits = Number(options?.lineOffsetUnits);
            const lineOffsetUnits = Number.isFinite(explicitOffsetUnits)
                ? explicitOffsetUnits
                : (role === 'line' ? resolveLineOffsetUnitsCached(offsetLineId) : 0);
            const featureKey = [
                role,
                String(lineId || ''),
                routeLineId,
                geometryLineId,
                offsetLineId,
                rawColor,
                options?.isPast === true ? 'past' : 'current',
                String(lineOffsetUnits),
                coordsKey(coords)
            ].join('||');
            if (lineFeatureCache instanceof Map && lineFeatureCache.has(featureKey)) {
                return;
            }
            const feature = {
                type: 'Feature',
                properties: {
                    role,
                    lineId: String(lineId || ''),
                    r: routeLineId,
                    geometry_line_id: geometryLineId,
                    line_offset_id: offsetLineId,
                    color: rawColor,
                    isPast: options?.isPast === true,
                    line_offset_units: lineOffsetUnits
                },
                geometry: { type: 'LineString', coordinates: coords }
            };
            if (lineFeatureCache instanceof Map) {
                lineFeatureCache.set(featureKey, true);
            }
            outLineFeatures.push(feature);
        };

        for (let i = 0; i < segments.length; i += 1) {
            const seg = segments[i] || {};
            const lineId = String(seg.lineId || '').trim();
            const segmentStationIds = Array.isArray(seg.stationIds)
                ? seg.stationIds.map((x) => String(x).trim()).filter(Boolean)
                : [];
            const routeLineId = resolveSegmentRouteLineId(seg, lineId);
            const geometryLineId = resolveSegmentGeometryLineId(seg, routeLineId || lineId);
            const offsetLineId = resolveSegmentOffsetLineId(seg, geometryLineId);
            const segColor = resolveSegColor(seg, geometryLineId || lineId);
            const isLoopDirectionSeg = !!isLoopDirection?.(seg?.d);
            const stationIds = segmentStationIds;
            const segmentPastStationIds = getPastStationIdSet(seg);
            const segmentCurrentStationIds = getCurrentStationIdSet(seg);

            if (debugLoop && (seg?.d || isLoopDirectionSeg)) {
                try {
                    console.debug('[trip-preview seg]', {
                        lineId,
                        d: seg?.d,
                        preferLoopShortest: isLoopDirectionSeg,
                        stationCount: stationIds.length,
                        first: stationIds[0] || null,
                        last: stationIds[stationIds.length - 1] || null
                    });
                } catch {
                    // ignore
                }
            }

            const sourceLineIdForStation = lineId || routeLineId || geometryLineId;
            for (const sid of stationIds) {
                const previewStationId = resolvePreviewStationId(sid, sourceLineIdForStation, usePanelAlternateTripPreview);
                stopIds.add(previewStationId);
                if (hasPastStation(segmentPastStationIds, sid)) pastStopIds.add(previewStationId);
            }

            for (let j = 0; j < stationIds.length - 1; j += 1) {
                const fromId = stationIds[j];
                const toId = stationIds[j + 1];
                const pairGeometryLineId = geometryLineId || lineId;
                const pairOffsetLineId = offsetLineId || pairGeometryLineId;
                const from = getTripStationCoord(fromId, lineId || routeLineId || pairGeometryLineId, usePanelAlternateTripPreview);
                const to = getTripStationCoord(toId, lineId || routeLineId || pairGeometryLineId, usePanelAlternateTripPreview);
                if (!from || !to) continue;
                const pairIsPast = (
                    hasPastStation(segmentPastStationIds, fromId)
                    && hasPastStation(segmentPastStationIds, toId)
                ) || (
                    hasPastStation(segmentPastStationIds, fromId)
                    && hasCurrentStation(segmentCurrentStationIds, toId)
                ) || (
                    hasCurrentStation(segmentCurrentStationIds, fromId)
                    && hasPastStation(segmentPastStationIds, toId)
                );
                const pairColor = pairIsPast
                    ? pastColor
                    : resolvePairColor(seg, fromId, toId, segColor, lineId || routeLineId || pairGeometryLineId);
                const alternateBoundary = pairIsPast
                    ? null
                    : resolvePairAlternateBoundary(seg, fromId, toId, lineId || routeLineId || pairGeometryLineId);

                const clipped = getCachedLineSegment(pairGeometryLineId || geometryLineId || lineId, from, to, {
                    preferLoopShortest: isLoopDirectionSeg,
                    direction: seg?.d,
                    preserveLineDirection: true
                });
                if (clipped && clipped.length >= 2) {
                    pushPairLineFeature(clipped, lineId, 'line', pairColor, {
                        routeLineId,
                        geometryLineId: pairGeometryLineId || geometryLineId || lineId,
                        offsetLineId: pairOffsetLineId || offsetLineId,
                        isPast: pairIsPast
                    }, alternateBoundary);
                }
                else {
                    pushPairLineFeature([from, to], lineId, 'connector', pairColor, {
                        routeLineId,
                        geometryLineId: pairGeometryLineId || geometryLineId || lineId,
                        offsetLineId: pairOffsetLineId || offsetLineId,
                        lineOffsetUnits: resolveLineOffsetUnitsCached(pairOffsetLineId || offsetLineId),
                        isPast: pairIsPast
                    }, alternateBoundary);
                }
            }

            if (i > 0) {
                const prev = segments[i - 1] || {};
                const prevIds = Array.isArray(prev.stationIds) ? prev.stationIds : [];
                const prevLast = String(prevIds.length ? prevIds[prevIds.length - 1] : '').trim();
                const currFirst = String(stationIds.length ? stationIds[0] : '').trim();
                if (prevLast && currFirst && !isSamePhysicalStation?.(prevLast, currFirst)) {
                    const a = getTripStationCoord(prevLast, prev?.lineId, usePanelAlternateTripPreview);
                    const b = getTripStationCoord(currFirst, lineId, usePanelAlternateTripPreview);
                    if (a && b) {
                        const prevRouteLineId = resolveSegmentRouteLineId(prev, prev?.lineId);
                        const prevGeometryLineId = resolveSegmentGeometryLineId(prev, prevRouteLineId || prev?.lineId);
                        const prevOffsetLineId = resolveSegmentOffsetLineId(prev, prevGeometryLineId);
                        const prevDisplayLineId = String(prev?.lineId || prevGeometryLineId || '').trim();
                        const prevPastStationIds = getPastStationIdSet(prev);
                        const prevCurrentStationIds = getCurrentStationIdSet(prev);
                        const bridgeIsPast = (
                            hasPastStation(prevPastStationIds, prevLast)
                            && hasPastStation(segmentPastStationIds, currFirst)
                        ) || (
                            hasPastStation(prevPastStationIds, prevLast)
                            && hasCurrentStation(segmentCurrentStationIds, currFirst)
                        ) || (
                            hasCurrentStation(prevCurrentStationIds, prevLast)
                            && hasPastStation(segmentPastStationIds, currFirst)
                        );
                        const bridge = nearestBridgeBetweenLines?.(prevGeometryLineId, geometryLineId || lineId, a, b);
                        const canUseBridge = bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                        if (canUseBridge) {
                            const segA = getCachedLineSegment(prevGeometryLineId, a, bridge.a, {
                                preserveLineDirection: true
                            });
                            const segB = getCachedLineSegment(geometryLineId || lineId, bridge.b, b, {
                                preserveLineDirection: true
                            });
                            const prevSegColor = bridgeIsPast
                                ? pastColor
                                : (resolveSegColor(prev, prevGeometryLineId || prevDisplayLineId) || segColor);
                            const bridgeColor = bridgeIsPast ? pastColor : (segColor || prevSegColor);
                            if (segA && segA.length >= 2) {
                                pushLineFeature(segA, prevDisplayLineId, 'line', prevSegColor, {
                                    routeLineId: prevRouteLineId,
                                    geometryLineId: prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: prevOffsetLineId,
                                    isPast: bridgeIsPast
                                });
                            }
                            if (bridge.dist > 25) {
                                pushLineFeature([bridge.a, bridge.b], lineId || prevDisplayLineId, 'connector', bridgeColor, {
                                    routeLineId: routeLineId || prevRouteLineId,
                                    geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: offsetLineId || prevOffsetLineId,
                                    isPast: bridgeIsPast
                                });
                            }
                            if (segB && segB.length >= 2) {
                                pushLineFeature(segB, lineId, 'line', bridgeColor, {
                                    routeLineId,
                                    geometryLineId: geometryLineId || lineId,
                                    offsetLineId,
                                    isPast: bridgeIsPast
                                });
                            }

                            if ((!segA || segA.length < 2) && (!segB || segB.length < 2)) {
                                const fallbackDist = distMeters?.(a, b);
                                if (Number.isFinite(fallbackDist) && fallbackDist <= 3000) {
                                    pushLineFeature([a, b], lineId || prevDisplayLineId, 'connector', bridgeColor, {
                                        routeLineId: routeLineId || prevRouteLineId,
                                        geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                        offsetLineId: offsetLineId || prevOffsetLineId,
                                        isPast: bridgeIsPast
                                    });
                                }
                            }
                        } else {
                            const directDist = distMeters?.(a, b);
                            if (Number.isFinite(directDist) && directDist <= 3000) {
                                pushLineFeature([a, b], lineId || prevDisplayLineId, 'connector', bridgeIsPast ? pastColor : segColor, {
                                    routeLineId: routeLineId || prevRouteLineId,
                                    geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: offsetLineId || prevOffsetLineId,
                                    isPast: bridgeIsPast
                                });
                            }
                        }
                    }
                }
            }
        }

        const firstSeg = segments.find((s) => Array.isArray(s?.stationIds) && s.stationIds.length) || null;
        const lastSeg = (() => {
            for (let i = segments.length - 1; i >= 0; i -= 1) {
                const s = segments[i];
                if (Array.isArray(s?.stationIds) && s.stationIds.length) return s;
            }
            return null;
        })();

        const startStationId = firstSeg ? String(firstSeg.stationIds[0] || '').trim() : '';
        const endStationId = lastSeg
            ? String(lastSeg.stationIds[lastSeg.stationIds.length - 1] || '').trim()
            : '';
        const endpointStationIds = new Set([startStationId, endStationId].filter(Boolean));

        for (const sid of stopIds) {
            const c = getTripStationCoord(sid, '', usePanelAlternateTripPreview);
            if (!c) continue;
            const isPast = pastStopIds.has(sid);
            const servingCount = getServingCount(sid);
            const isEndpoint = endpointStationIds.has(sid);
            const stopFeatureKey = [
                sid,
                coordKey(c),
                isPast ? 'past' : 'current',
                String(servingCount),
                isEndpoint ? 'endpoint' : 'normal'
            ].join('||');
            if (stopFeatureCache instanceof Map && stopFeatureCache.has(stopFeatureKey)) {
                continue;
            }
            const feature = {
                type: 'Feature',
                properties: {
                    id: sid,
                    isPast,
                    serving_count: servingCount,
                    ...(isEndpoint ? { is_preview_endpoint: 1 } : {})
                },
                geometry: { type: 'Point', coordinates: c }
            };
            if (stopFeatureCache instanceof Map) {
                stopFeatureCache.set(stopFeatureKey, true);
            }
            outStopFeatures.push(feature);
        }

        let bbox = null;
        for (const c of coordsForBbox) {
            const lng = Number(c?.[0]);
            const lat = Number(c?.[1]);
            bbox = extendBBox?.(bbox, lng, lat) || bbox;
        }

        return {
            lineFc: { type: 'FeatureCollection', features: outLineFeatures },
            stopFc: { type: 'FeatureCollection', features: outStopFeatures },
            lineIds: new Set(segments.map((s) => resolveSegmentRouteLineId(s, s?.lineId)).filter(Boolean)),
            stopIds,
            pastStopIds,
            startStationId,
            endStationId,
            bbox
        };
    };

    return { buildTripPreviewFeatures };
};

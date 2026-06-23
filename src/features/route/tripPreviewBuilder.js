import { getPairMapValue } from '../../domain/alternateLineMembership.js';

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

    const buildTripPreviewFeatures = (payload) => {
        const outLineFeatures = [];
        const outStopFeatures = [];
        const coordsForBbox = [];
        const stopIds = new Set();
        const debugLoop = !!isDebugLoopEnabled?.();
        const usePanelAlternateTripPreview = String(payload?.previewSource || payload?.__previewSource || '').trim() === 'panel-trip';

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
                const mainTerminalCoord = getStationCoord(mainTerminalId);
                const ntFirstCoord = getStationCoord(ntFirstStationId);
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
        const resolveSegColor = (seg, fallbackLineId) => {
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
                    const boundaryCoord = boundaryStationId ? getStationCoord(boundaryStationId, sourceLineId, true) : null;
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
                : (role === 'line' ? resolveLineOffsetUnits(offsetLineId) : 0);
            outLineFeatures.push({
                type: 'Feature',
                properties: {
                    role,
                    lineId: String(lineId || ''),
                    r: routeLineId,
                    geometry_line_id: geometryLineId,
                    line_offset_id: offsetLineId,
                    color: rawColor,
                    line_offset_units: lineOffsetUnits
                },
                geometry: { type: 'LineString', coordinates: coords }
            });
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
                stopIds.add(resolvePreviewStationId(sid, sourceLineIdForStation, usePanelAlternateTripPreview));
            }

            for (let j = 0; j < stationIds.length - 1; j += 1) {
                const fromId = stationIds[j];
                const toId = stationIds[j + 1];
                const pairGeometryLineId = geometryLineId || lineId;
                const pairOffsetLineId = offsetLineId || pairGeometryLineId;
                const from = getStationCoord(fromId, lineId || routeLineId || pairGeometryLineId, usePanelAlternateTripPreview);
                const to = getStationCoord(toId, lineId || routeLineId || pairGeometryLineId, usePanelAlternateTripPreview);
                if (!from || !to) continue;
                const pairColor = resolvePairColor(seg, fromId, toId, segColor, lineId || routeLineId || pairGeometryLineId);
                const alternateBoundary = resolvePairAlternateBoundary(seg, fromId, toId, lineId || routeLineId || pairGeometryLineId);

                const clipped = extractLineSegment?.(pairGeometryLineId || geometryLineId || lineId, from, to, {
                    preferLoopShortest: isLoopDirectionSeg,
                    direction: seg?.d,
                    preserveLineDirection: true
                });
                if (clipped && clipped.length >= 2) {
                    pushPairLineFeature(clipped, lineId, 'line', pairColor, {
                        routeLineId,
                        geometryLineId: pairGeometryLineId || geometryLineId || lineId,
                        offsetLineId: pairOffsetLineId || offsetLineId
                    }, alternateBoundary);
                }
                else {
                    pushPairLineFeature([from, to], lineId, 'connector', pairColor, {
                        routeLineId,
                        geometryLineId: pairGeometryLineId || geometryLineId || lineId,
                        offsetLineId: pairOffsetLineId || offsetLineId,
                        lineOffsetUnits: resolveLineOffsetUnits(pairOffsetLineId || offsetLineId)
                    }, alternateBoundary);
                }
            }

            if (i > 0) {
                const prev = segments[i - 1] || {};
                const prevIds = Array.isArray(prev.stationIds) ? prev.stationIds : [];
                const prevLast = String(prevIds.length ? prevIds[prevIds.length - 1] : '').trim();
                const currFirst = String(stationIds.length ? stationIds[0] : '').trim();
                if (prevLast && currFirst && !isSamePhysicalStation?.(prevLast, currFirst)) {
                    const a = getStationCoord(prevLast, prev?.lineId, usePanelAlternateTripPreview);
                    const b = getStationCoord(currFirst, lineId, usePanelAlternateTripPreview);
                    if (a && b) {
                        const prevRouteLineId = resolveSegmentRouteLineId(prev, prev?.lineId);
                        const prevGeometryLineId = resolveSegmentGeometryLineId(prev, prevRouteLineId || prev?.lineId);
                        const prevOffsetLineId = resolveSegmentOffsetLineId(prev, prevGeometryLineId);
                        const prevDisplayLineId = String(prev?.lineId || prevGeometryLineId || '').trim();
                        const bridge = nearestBridgeBetweenLines?.(prevGeometryLineId, geometryLineId || lineId, a, b);
                        const canUseBridge = bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                        if (canUseBridge) {
                            const segA = extractLineSegment?.(prevGeometryLineId, a, bridge.a, {
                                preserveLineDirection: true
                            });
                            const segB = extractLineSegment?.(geometryLineId || lineId, bridge.b, b, {
                                preserveLineDirection: true
                            });
                            const prevSegColor = resolveSegColor(prev, prevGeometryLineId || prevDisplayLineId) || segColor;
                            if (segA && segA.length >= 2) {
                                pushLineFeature(segA, prevDisplayLineId, 'line', prevSegColor, {
                                    routeLineId: prevRouteLineId,
                                    geometryLineId: prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: prevOffsetLineId
                                });
                            }
                            if (bridge.dist > 25) {
                                pushLineFeature([bridge.a, bridge.b], lineId || prevDisplayLineId, 'connector', segColor || prevSegColor, {
                                    routeLineId: routeLineId || prevRouteLineId,
                                    geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: offsetLineId || prevOffsetLineId
                                });
                            }
                            if (segB && segB.length >= 2) {
                                pushLineFeature(segB, lineId, 'line', segColor, {
                                    routeLineId,
                                    geometryLineId: geometryLineId || lineId,
                                    offsetLineId
                                });
                            }

                            if ((!segA || segA.length < 2) && (!segB || segB.length < 2)) {
                                const fallbackDist = distMeters?.(a, b);
                                if (Number.isFinite(fallbackDist) && fallbackDist <= 3000) {
                                    pushLineFeature([a, b], lineId || prevDisplayLineId, 'connector', segColor, {
                                        routeLineId: routeLineId || prevRouteLineId,
                                        geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                        offsetLineId: offsetLineId || prevOffsetLineId
                                    });
                                }
                            }
                        } else {
                            const directDist = distMeters?.(a, b);
                            if (Number.isFinite(directDist) && directDist <= 3000) {
                                pushLineFeature([a, b], lineId || prevDisplayLineId, 'connector', segColor, {
                                    routeLineId: routeLineId || prevRouteLineId,
                                    geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: offsetLineId || prevOffsetLineId
                                });
                            }
                        }
                    }
                }
            }
        }

        for (const sid of stopIds) {
            const c = getStationCoord(sid, '', usePanelAlternateTripPreview);
            if (!c) continue;
            outStopFeatures.push({
                type: 'Feature',
                properties: {
                    id: sid,
                    serving_count: Number(stationServingCountById?.get(sid) || 1)
                },
                geometry: { type: 'Point', coordinates: c }
            });
        }

        let bbox = null;
        for (const c of coordsForBbox) {
            const lng = Number(c?.[0]);
            const lat = Number(c?.[1]);
            bbox = extendBBox?.(bbox, lng, lat) || bbox;
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

        return {
            lineFc: { type: 'FeatureCollection', features: outLineFeatures },
            stopFc: { type: 'FeatureCollection', features: outStopFeatures },
            lineIds: new Set(segments.map((s) => resolveSegmentRouteLineId(s, s?.lineId)).filter(Boolean)),
            stopIds,
            startStationId,
            endStationId,
            bbox
        };
    };

    return { buildTripPreviewFeatures };
};

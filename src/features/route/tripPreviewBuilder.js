export const createTripPreviewBuilder = ({
    stationCoordByIdBase,
    stationCoordById,
    stationServingCountById,
    lineColorById,
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
    const getStationCoord = (stationId) => {
        const sid = String(stationId || '').trim();
        return stationCoordByIdBase?.get(sid) || stationCoordById?.get(sid);
    };

    const getLineColor = (lineId) => {
        return lineColorById?.get(String(lineId || '')) || '';
    };

    const resolveLineOffsetUnits = (lineId) => {
        const n = Number(getLineOffsetUnits?.(String(lineId || '').trim()));
        return Number.isFinite(n) ? n : 0;
    };

    const inferLineIdFromStationId = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return '';
        const parts = sid.split('.').map((x) => x.trim()).filter(Boolean);
        return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '';
    };

    const inferLineIdFromStationIds = (stationIds) => {
        const ids = Array.isArray(stationIds) ? stationIds : [];
        const counts = new Map();
        for (const sid of ids) {
            const lineId = inferLineIdFromStationId(sid);
            if (!lineId) continue;
            counts.set(lineId, (counts.get(lineId) || 0) + 1);
        }
        if (!counts.size) return '';
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0] || '';
    };

    const isVirtualLineId = (lineId) => {
        const id = String(lineId || '').trim();
        return !id
            || id.startsWith('__')
            || id.startsWith('TokyoRail.')
            || id.includes('MenuThrough')
            || id.includes('ThroughService');
    };

    const resolveSegmentGeometryLineId = (seg, fallbackLineId = '', stationIds = []) => {
        const explicitGeometry = String(seg?.geometryLineId || seg?.geometry_line_id || '').trim();
        if (explicitGeometry && !isVirtualLineId(explicitGeometry)) return explicitGeometry;

        const explicitOffset = String(seg?.offsetLineId || seg?.line_offset_id || '').trim();
        if (explicitOffset && !isVirtualLineId(explicitOffset)) return explicitOffset;

        const ownLineId = String(seg?.lineId || '').trim();
        if (ownLineId && !isVirtualLineId(ownLineId)) return ownLineId;

        const fallback = String(fallbackLineId || '').trim();
        if (fallback && !isVirtualLineId(fallback)) return fallback;

        const inferred = inferLineIdFromStationIds(stationIds);
        if (inferred) return inferred;

        return String(
            explicitGeometry
            || explicitOffset
            || ownLineId
            || fallback
            || ''
        ).trim();
    };

    const resolveSegmentOffsetLineId = (seg, geometryLineId = '', stationIds = []) => {
        const explicitOffset = String(seg?.offsetLineId || seg?.line_offset_id || '').trim();
        if (explicitOffset && !isVirtualLineId(explicitOffset)) return explicitOffset;
        const explicitGeometry = String(seg?.geometryLineId || seg?.geometry_line_id || '').trim();
        if (explicitGeometry && !isVirtualLineId(explicitGeometry)) return explicitGeometry;
        if (geometryLineId && !isVirtualLineId(geometryLineId)) return geometryLineId;
        return inferLineIdFromStationIds(stationIds) || geometryLineId || explicitOffset || explicitGeometry || '';
    };

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
                const ntLineId = resolveSegmentGeometryLineId(ntSeg, '', Array.isArray(ntSeg?.stationIds) ? ntSeg.stationIds : []);

                if (mainTerminalCoord && ntFirstCoord && ntLineId) {
                    const directDist = distMeters?.(mainTerminalCoord, ntFirstCoord);
                    if (directDist <= 8000) {
                        allowNt = true;
                    } else {
                        const mainSeg = allSegments.find((s) => String(s?.kind) === 'main') || {};
                        const mainLineId = resolveSegmentGeometryLineId(mainSeg, payload?.mainLineId, Array.isArray(mainSeg?.stationIds) ? mainSeg.stationIds : []);
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

        const pushLineFeature = (coords, lineId, role = 'line', colorOverride = '', options = {}) => {
            if (!Array.isArray(coords) || coords.length < 2) return;
            for (const c of coords) {
                if (Array.isArray(c) && c.length >= 2) coordsForBbox.push(c);
            }
            const geometryLineId = String(options?.geometryLineId || lineId || '').trim();
            const offsetLineId = String(options?.offsetLineId || geometryLineId || '').trim();
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
            const geometryLineId = resolveSegmentGeometryLineId(seg, lineId, segmentStationIds);
            const offsetLineId = resolveSegmentOffsetLineId(seg, geometryLineId, segmentStationIds);
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

            for (const sid of stationIds) stopIds.add(sid);

            for (let j = 0; j < stationIds.length - 1; j += 1) {
                const fromId = stationIds[j];
                const toId = stationIds[j + 1];
                const from = getStationCoord(fromId);
                const to = getStationCoord(toId);
                if (!from || !to) continue;
                const pairStationIds = [fromId, toId];
                const pairGeometryLineId = resolveSegmentGeometryLineId(seg, geometryLineId || lineId, pairStationIds);
                const pairOffsetLineId = resolveSegmentOffsetLineId(seg, pairGeometryLineId, pairStationIds);

                const clipped = extractLineSegment?.(pairGeometryLineId || geometryLineId || lineId, from, to, {
                    preferLoopShortest: isLoopDirectionSeg,
                    direction: seg?.d
                });
                if (clipped && clipped.length >= 2) {
                    pushLineFeature(clipped, lineId, 'line', segColor, {
                        geometryLineId: pairGeometryLineId || geometryLineId || lineId,
                        offsetLineId: pairOffsetLineId || offsetLineId
                    });
                }
                else {
                    pushLineFeature([from, to], lineId, 'connector', segColor, {
                        geometryLineId: pairGeometryLineId || geometryLineId || lineId,
                        offsetLineId: pairOffsetLineId || offsetLineId,
                        lineOffsetUnits: resolveLineOffsetUnits(pairOffsetLineId || offsetLineId)
                    });
                }
            }

            if (i > 0) {
                const prev = segments[i - 1] || {};
                const prevIds = Array.isArray(prev.stationIds) ? prev.stationIds : [];
                const prevLast = String(prevIds.length ? prevIds[prevIds.length - 1] : '').trim();
                const currFirst = String(stationIds.length ? stationIds[0] : '').trim();
                if (prevLast && currFirst && !isSamePhysicalStation?.(prevLast, currFirst)) {
                    const a = getStationCoord(prevLast);
                    const b = getStationCoord(currFirst);
                    if (a && b) {
                        const prevStationIds = Array.isArray(prev?.stationIds) ? prev.stationIds : [];
                        const prevGeometryLineId = resolveSegmentGeometryLineId(prev, prev?.lineId, prevStationIds);
                        const prevOffsetLineId = resolveSegmentOffsetLineId(prev, prevGeometryLineId, prevStationIds);
                        const prevDisplayLineId = String(prev?.lineId || prevGeometryLineId || '').trim();
                        const bridge = nearestBridgeBetweenLines?.(prevGeometryLineId, geometryLineId || lineId, a, b);
                        const canUseBridge = bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                        if (canUseBridge) {
                            const segA = extractLineSegment?.(prevGeometryLineId, a, bridge.a);
                            const segB = extractLineSegment?.(geometryLineId || lineId, bridge.b, b);
                            const prevSegColor = resolveSegColor(prev, prevGeometryLineId || prevDisplayLineId) || segColor;
                            if (segA && segA.length >= 2) {
                                pushLineFeature(segA, prevDisplayLineId, 'line', prevSegColor, {
                                    geometryLineId: prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: prevOffsetLineId
                                });
                            }
                            if (bridge.dist > 25) {
                                pushLineFeature([bridge.a, bridge.b], lineId || prevDisplayLineId, 'connector', segColor || prevSegColor, {
                                    geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                    offsetLineId: offsetLineId || prevOffsetLineId
                                });
                            }
                            if (segB && segB.length >= 2) {
                                pushLineFeature(segB, lineId, 'line', segColor, {
                                    geometryLineId: geometryLineId || lineId,
                                    offsetLineId
                                });
                            }

                            if ((!segA || segA.length < 2) && (!segB || segB.length < 2)) {
                                const fallbackDist = distMeters?.(a, b);
                                if (Number.isFinite(fallbackDist) && fallbackDist <= 3000) {
                                    pushLineFeature([a, b], lineId || prevDisplayLineId, 'connector', segColor, {
                                        geometryLineId: geometryLineId || lineId || prevGeometryLineId || prevDisplayLineId,
                                        offsetLineId: offsetLineId || prevOffsetLineId
                                    });
                                }
                            }
                        } else {
                            const directDist = distMeters?.(a, b);
                            if (Number.isFinite(directDist) && directDist <= 3000) {
                                pushLineFeature([a, b], lineId || prevDisplayLineId, 'connector', segColor, {
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
            const c = getStationCoord(sid);
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
            lineIds: new Set(segments.map((s) => String(s?.lineId || '').trim()).filter(Boolean)),
            stopIds,
            startStationId,
            endStationId,
            bbox
        };
    };

    return { buildTripPreviewFeatures };
};

import {
    aggregateTripPreviewLineFeatureItems,
    buildEndpointStationIdSetFromPayloadList,
    isTripPreviewEndpointProps,
    markTripPreviewStopFeatureEndpoint,
    normalizeDirPreviewPayload
} from '../../domain/routePreviewSelection.js';

export const createRouteFeature = ({
    tripPreviewRenderer,
    emitTripPreviewUpdated,
    emitTripPreviewCleared
} = {}) => {
    if (!tripPreviewRenderer) {
        throw new Error('routeFeature requires tripPreviewRenderer');
    }

    const tripPreviewSelectionsByKey = new Map();

    const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

    const isTripPreviewPerfEnabled = () => {
        const globalFlag = globalThis?.__TOKYO_RAIL_TRIP_PREVIEW_PERF__;
        if (globalFlag === true || globalFlag === '1') return true;
        try {
            return globalThis?.localStorage?.getItem?.('tokyoRail.tripPreviewPerf') === '1';
        } catch {
            return false;
        }
    };

    const createTripPreviewPerfProbe = (payload, mode) => {
        if (!isTripPreviewPerfEnabled()) return null;
        const startedAt = nowMs();
        let lastAt = startedAt;
        const steps = [];
        const source = String(payload?.previewSource || payload?.__previewSource || '').trim();
        const tripKey = String(payload?.tripKey || '').trim();
        const virtualTripCount = Array.isArray(payload?.virtualTrips) ? payload.virtualTrips.length : 0;

        const mark = (name, extra = {}) => {
            const currentAt = nowMs();
            steps.push({
                step: name,
                ms: Number((currentAt - lastAt).toFixed(2)),
                totalMs: Number((currentAt - startedAt).toFixed(2)),
                ...extra
            });
            lastAt = currentAt;
        };

        const finish = (result = {}) => {
            const totalMs = Number((nowMs() - startedAt).toFixed(2));
            try {
                console.info('[trip-preview perf]', {
                    mode,
                    source,
                    tripKey,
                    virtualTripCount,
                    ok: result?.ok !== false,
                    reason: result?.reason || '',
                    lineFeatureCount: result?.built?.lineFc?.features?.length ?? null,
                    stopFeatureCount: result?.built?.stopFc?.features?.length ?? null,
                    rawLineFeatureCount: result?.built?.rawLineFeatureCount ?? null,
                    rawStopFeatureCount: result?.built?.rawStopFeatureCount ?? null,
                    lineFeatureDuplicateCount: result?.built?.lineFeatureDuplicateCount ?? null,
                    stopFeatureDuplicateCount: result?.built?.stopFeatureDuplicateCount ?? null,
                    lineFeatureCacheHitCount: result?.built?.lineFeatureCacheHitCount ?? null,
                    stopFeatureCacheHitCount: result?.built?.stopFeatureCacheHitCount ?? null,
                    lineIdCount: result?.built?.lineIds?.size ?? null,
                    stopIdCount: result?.built?.stopIds?.size ?? null,
                    totalMs,
                    steps
                });
            } catch {
                // ignore debug logging failures
            }
        };

        return { mark, finish };
    };

    const normalizeKey = (key) => String(key || '').trim();

    const getTripPreviewSelectionSource = (entry, resolveSource) => {
        const direct = String(entry?.source || '').trim();
        if (direct) return direct;
        if (typeof resolveSource !== 'function') return '';
        return String(resolveSource(entry?.payload) || '').trim();
    };

    const getFitMode = (payload) => String(payload?.fitMode || 'preview').trim() || 'preview';

    const getPreviewInteraction = (payload) => {
        return String(payload?.__previewInteraction || payload?.previewInteraction || '').trim() || '';
    };

    const getVirtualTrips = (payload) => {
        return Array.isArray(payload?.virtualTrips)
            ? payload.virtualTrips.filter((x) => x && Array.isArray(x?.segments) && x.segments.length)
            : [];
    };

    const hasVisibleBuiltPreview = (built) => {
        return built?.lineIds instanceof Set && built.lineIds.size > 0;
    };

    const getBuiltEndpointStationIds = (built) => {
        const out = new Set();
        if (built?.endpointStationIds instanceof Set) {
            for (const stationId of built.endpointStationIds) {
                const id = normalizeKey(stationId);
                if (id) out.add(id);
            }
        }
        const startStationId = normalizeKey(built?.startStationId);
        const endStationId = normalizeKey(built?.endStationId);
        if (startStationId) out.add(startStationId);
        if (endStationId) out.add(endStationId);
        return out;
    };

    const addStationId = (out, stationId) => {
        const id = normalizeKey(stationId);
        if (id) out.add(id);
    };

    const addStationIds = (out, stationIds) => {
        const list = stationIds instanceof Set
            ? Array.from(stationIds)
            : (Array.isArray(stationIds) ? stationIds : []);
        for (const stationId of list) addStationId(out, stationId);
    };

    const getExplicitEndpointStationIds = (payload) => {
        const out = new Set();
        addStationIds(out, payload?.originStationIds);
        addStationIds(out, payload?.terminalStationIds);
        addStationId(out, payload?.originStationId);
        addStationId(out, payload?.terminalStationId);
        addStationId(out, payload?.mainOriginStationId);
        addStationId(out, payload?.mainTerminalStationId);
        return out;
    };

    const buildPreviewEndpointStationIds = ({ payload, built, payloadList } = {}) => {
        const out = getExplicitEndpointStationIds(payload);

        const segmentEndpointIds = buildEndpointStationIdSetFromPayloadList(
            Array.isArray(payloadList) && payloadList.length ? payloadList : [payload]
        );
        addStationIds(out, segmentEndpointIds);
        addStationIds(out, getBuiltEndpointStationIds(built));

        return out;
    };

    const attachEndpointStationIds = (built, endpointStationIds) => ({
        ...(built || {}),
        endpointStationIds: endpointStationIds instanceof Set ? new Set(endpointStationIds) : new Set()
    });

    return {
        ensureTripPreviewLayers() {
            tripPreviewRenderer.ensureLayers();
        },
        resetTripPreviewLayers() {
            tripPreviewRenderer.reset();
        },
        setTripPreviewData({ lineFc, stopFc } = {}) {
            tripPreviewRenderer.setData({ lineFc, stopFc });
        },
        notifyTripPreviewUpdated({ payload, built } = {}) {
            emitTripPreviewUpdated?.({ payload, built });
        },
        notifyTripPreviewCleared() {
            emitTripPreviewCleared?.();
        },
        getTripPreviewSelectionSize() {
            return tripPreviewSelectionsByKey.size;
        },
        getTripPreviewSelection(key) {
            return tripPreviewSelectionsByKey.get(normalizeKey(key));
        },
        getTripPreviewSelectionKeys() {
            return Array.from(tripPreviewSelectionsByKey.keys());
        },
        getTripPreviewSelectionValues() {
            return Array.from(tripPreviewSelectionsByKey.values());
        },
        getTripPreviewSelectionEntries() {
            return Array.from(tripPreviewSelectionsByKey.entries());
        },
        hasTripPreviewSelection(key) {
            return tripPreviewSelectionsByKey.has(normalizeKey(key));
        },
        setTripPreviewSelection(key, entry) {
            const k = normalizeKey(key);
            if (!k) return false;
            tripPreviewSelectionsByKey.set(k, entry || {});
            return true;
        },
        deleteTripPreviewSelection(key) {
            const k = normalizeKey(key);
            if (!k) return false;
            return tripPreviewSelectionsByKey.delete(k);
        },
        clearTripPreviewSelections() {
            if (!tripPreviewSelectionsByKey.size) return false;
            tripPreviewSelectionsByKey.clear();
            return true;
        },
        hasVisibleTripPreviewSelectionBySource(source, resolveSource) {
            const target = normalizeKey(source);
            if (!target) return false;
            for (const entry of tripPreviewSelectionsByKey.values()) {
                const current = getTripPreviewSelectionSource(entry, resolveSource);
                if (current === target && entry?.hidden !== true) return true;
            }
            return false;
        },
        deleteTripPreviewSelectionsBySource(source, resolveSource) {
            const target = normalizeKey(source);
            if (!target) return false;
            let removed = false;
            for (const [key, entry] of Array.from(tripPreviewSelectionsByKey.entries())) {
                const current = getTripPreviewSelectionSource(entry, resolveSource);
                if (current !== target) continue;
                tripPreviewSelectionsByKey.delete(key);
                removed = true;
            }
            return removed;
        },
        toggleTripPreviewSelectionVisibility(key) {
            const k = normalizeKey(key);
            if (!k || !tripPreviewSelectionsByKey.has(k)) return false;
            const current = tripPreviewSelectionsByKey.get(k) || {};
            tripPreviewSelectionsByKey.set(k, {
                ...current,
                hidden: !(current?.hidden === true)
            });
            return true;
        },
        buildMultiTripPreviewAggregate({ buildLineFeatureDedupKey } = {}) {
            const lineFeatureItems = [];
            const stopFeatureByStationId = new Map();
            const lineIds = new Set();
            const stopIds = new Set();
            const pastStopIds = new Set();
            const endpointStationIds = new Set();
            let bbox = null;

            for (const entry of tripPreviewSelectionsByKey.values()) {
                if (entry?.hidden === true) continue;
                const built = entry?.built;
                const lineFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features : [];
                const stopFeatures = Array.isArray(built?.stopFc?.features) ? built.stopFc.features : [];
                const builtEndpointIds = getBuiltEndpointStationIds(built);
                addStationIds(endpointStationIds, builtEndpointIds);

                for (const lf of lineFeatures) {
                    lineFeatureItems.push({
                        feature: lf,
                        source: entry?.source
                    });
                }

                for (const sf of stopFeatures) {
                    const sid = String(sf?.properties?.id || '').trim();
                    if (!sid) continue;
                    const isEndpoint = builtEndpointIds.has(sid) || isTripPreviewEndpointProps(sf?.properties);
                    if (stopFeatureByStationId.has(sid)) {
                        const current = stopFeatureByStationId.get(sid);
                        if (isEndpoint && !isTripPreviewEndpointProps(current?.properties)) {
                            stopFeatureByStationId.set(sid, markTripPreviewStopFeatureEndpoint(current));
                        }
                        continue;
                    }
                    stopFeatureByStationId.set(
                        sid,
                        isEndpoint ? markTripPreviewStopFeatureEndpoint(sf) : sf
                    );
                }

                const ids = built?.lineIds instanceof Set ? built.lineIds : null;
                if (ids) {
                    for (const id of ids) {
                        const s = String(id || '').trim();
                        if (s) lineIds.add(s);
                    }
                }

                const sids = built?.stopIds instanceof Set ? built.stopIds : null;
                if (sids) {
                    for (const sid of sids) {
                        const s = String(sid || '').trim();
                        if (s) stopIds.add(s);
                    }
                }

                const pastIds = built?.pastStopIds instanceof Set ? built.pastStopIds : null;
                if (pastIds) {
                    for (const sid of pastIds) {
                        const s = String(sid || '').trim();
                        if (s) pastStopIds.add(s);
                    }
                } else {
                    for (const sf of stopFeatures) {
                        const sid = String(sf?.properties?.id || '').trim();
                        if (sid && sf?.properties?.isPast === true) pastStopIds.add(sid);
                    }
                }

                const b = built?.bbox;
                if (b && Number.isFinite(b.minLng) && Number.isFinite(b.maxLng) && Number.isFinite(b.minLat) && Number.isFinite(b.maxLat)) {
                    bbox = bbox
                        ? {
                            minLng: Math.min(bbox.minLng, b.minLng),
                            minLat: Math.min(bbox.minLat, b.minLat),
                            maxLng: Math.max(bbox.maxLng, b.maxLng),
                            maxLat: Math.max(bbox.maxLat, b.maxLat)
                        }
                        : { ...b };
                }
            }

            return {
                lineFc: {
                    type: 'FeatureCollection',
                    features: aggregateTripPreviewLineFeatureItems({
                        items: lineFeatureItems,
                        buildLineFeatureDedupKey
                    })
                },
                stopFc: { type: 'FeatureCollection', features: Array.from(stopFeatureByStationId.values()) },
                lineIds,
                stopIds,
                pastStopIds,
                endpointStationIds,
                bbox
            };
        },
        rebuildMultiTripPreview({
            aggregate,
            fitMode = 'none',
            hasBaseMultiSelection = false,
            applyPreviewState,
            clearEndpointPopups,
            syncStationOffset,
            setStationLabelMode,
            applySelectionEffects,
            scheduleCollisionLayerRefresh,
            previewFitWithSidePanels,
            emitMultiSelectLayersUpdated
        } = {}) {
            const built = aggregate || {};
            const hasVisible = built.lineIds instanceof Set && built.lineIds.size > 0;
            const hasAnySelection = tripPreviewSelectionsByKey.size > 0;

            tripPreviewRenderer.ensureLayers();
            try {
                tripPreviewRenderer.setData({ lineFc: built.lineFc, stopFc: built.stopFc });
            } catch {
                // Keep legacy route preview interactions non-fatal during renderer migration.
            }

            clearEndpointPopups?.();
            applyPreviewState?.({
                active: hasVisible,
                stationIds: hasVisible ? built.stopIds : null,
                endpointStationIds: hasVisible ? built.endpointStationIds : null,
                lineIds: hasVisible ? built.lineIds : null,
                pastStationIds: hasVisible ? built.pastStopIds : null,
                stationOverrideColor: ''
            });
            syncStationOffset?.();

            if (!hasVisible) {
                setStationLabelMode?.(hasBaseMultiSelection ? 'all' : 'auto');
                applySelectionEffects?.();
                scheduleCollisionLayerRefresh?.();
                emitTripPreviewCleared?.();
                emitMultiSelectLayersUpdated?.();
                return { hasVisible, hasAnySelection };
            }

            const payloadForExport = hasAnySelection && tripPreviewSelectionsByKey.size === 1
                ? Array.from(tripPreviewSelectionsByKey.values())[0]?.payload
                : {
                    selectedLineId: 'multi',
                    tripKey: Array.from(tripPreviewSelectionsByKey.keys()).join(' + ')
                };

            emitTripPreviewUpdated?.({ payload: payloadForExport, built });
            setStationLabelMode?.('all');
            applySelectionEffects?.();
            scheduleCollisionLayerRefresh?.();
            if (fitMode !== 'none' && built.bbox) {
                previewFitWithSidePanels?.(built.bbox);
            }
            emitMultiSelectLayersUpdated?.();
            return { hasVisible, hasAnySelection, payload: payloadForExport };
        },
        clearTripPathPreview({
            options = {},
            isMultiSelectModeEnabled,
            resolvePayloadSource,
            getActiveSource,
            rebuildMultiTripPreview,
            applyInactiveState,
            clearEndpointPopups,
            syncStationOffset,
            setStationLabelMode,
            applySelectionEffects,
            scheduleCollisionLayerRefresh,
            emitMultiSelectLayersUpdated
        } = {}) {
            const targetSource = normalizeKey(options?.source);

            if (targetSource && isMultiSelectModeEnabled?.()) {
                const removed = this.deleteTripPreviewSelectionsBySource(
                    targetSource,
                    resolvePayloadSource
                );
                if (removed) {
                    rebuildMultiTripPreview?.('none');
                }
                return;
            }

            if (targetSource && !isMultiSelectModeEnabled?.()) {
                const currentSource = normalizeKey(getActiveSource?.());
                if (currentSource && currentSource !== targetSource) return;
            }

            applyInactiveState?.();
            this.clearTripPreviewSelections();
            tripPreviewRenderer.reset();
            clearEndpointPopups?.();
            syncStationOffset?.();
            setStationLabelMode?.('auto');
            applySelectionEffects?.();
            scheduleCollisionLayerRefresh?.();
            emitTripPreviewCleared?.();
            emitMultiSelectLayersUpdated?.();
        },
        previewTripPath({
            payload,
            isMultiSelectModeEnabled,
            clearTripPathPreview,
            resolvePayloadSource,
            buildSelectionKey,
            buildAggregateFromPayloadList,
            buildFeatures,
            rebuildMultiTripPreview,
            resolveStationOverrideColor,
            resolveVirtualTripStationIds,
            applyActiveState,
            syncStationOffset,
            clearEndpointPopups,
            updateEndpointPopups,
            setStationLabelMode,
            applySelectionEffects,
            scheduleCollisionLayerRefresh,
            previewFitWithSidePanels
        } = {}) {
            const hasSegments = Array.isArray(payload?.segments) && payload.segments.length;
            const virtualTrips = getVirtualTrips(payload);

            if (!payload || (!hasSegments && !virtualTrips.length)) {
                clearTripPathPreview?.();
                return {
                    ok: false,
                    reason: 'invalid-payload'
                };
            }

            const fitMode = getFitMode(payload);
            const payloadSource = typeof resolvePayloadSource === 'function'
                ? String(resolvePayloadSource(payload) || '').trim()
                : '';
            const previewInteraction = getPreviewInteraction(payload);
            const inMultiSelectMode = !!isMultiSelectModeEnabled?.();
            const perfProbe = createTripPreviewPerfProbe(payload, virtualTrips.length ? 'virtual-trips' : 'single-trip');
            perfProbe?.mark('init', {
                hasSegments: !!hasSegments,
                multiSelect: inMultiSelectMode,
                fitMode,
                source: payloadSource
            });

            if (virtualTrips.length) {
                if (inMultiSelectMode) {
                    if (previewInteraction === 'hover') {
                        return {
                            ok: false,
                            reason: 'multiselect-hover-ignored',
                            payload,
                            source: payloadSource
                        };
                    }

                    const selectionKey = String(buildSelectionKey?.(payload) || '').trim();
                    if (!selectionKey) {
                        return {
                            ok: false,
                            reason: 'missing-selection-key',
                            payload,
                            source: payloadSource
                        };
                    }

                    const aggregate = buildAggregateFromPayloadList?.(virtualTrips);
                    perfProbe?.mark('buildAggregateFromPayloadList', {
                        rawLineFeatures: aggregate?.rawLineFeatureCount || 0,
                        rawStopFeatures: aggregate?.rawStopFeatureCount || 0,
                        lineFeatures: aggregate?.lineFc?.features?.length || 0,
                        stopFeatures: aggregate?.stopFc?.features?.length || 0,
                        lineFeatureDuplicates: aggregate?.lineFeatureDuplicateCount || 0,
                        stopFeatureDuplicates: aggregate?.stopFeatureDuplicateCount || 0,
                        lineFeatureCacheHits: aggregate?.lineFeatureCacheHitCount || 0,
                        stopFeatureCacheHits: aggregate?.stopFeatureCacheHitCount || 0
                    });
                    if (!hasVisibleBuiltPreview(aggregate)) {
                        this.deleteTripPreviewSelection(selectionKey);
                        rebuildMultiTripPreview?.('none');
                        const result = {
                            ok: false,
                            reason: 'empty-built',
                            payload,
                            built: aggregate,
                            source: payloadSource
                        };
                        perfProbe?.finish(result);
                        return result;
                    }
                    const endpointStationIds = buildPreviewEndpointStationIds({
                        payload,
                        built: aggregate,
                        payloadList: virtualTrips
                    });
                    perfProbe?.mark('buildEndpointStationIds', {
                        endpointStationIds: endpointStationIds.size
                    });

                    this.setTripPreviewSelection(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: attachEndpointStationIds({
                            lineFc: aggregate.lineFc,
                        stopFc: aggregate.stopFc,
                        lineIds: aggregate.lineIds,
                        stopIds: aggregate.stopIds,
                        pastStopIds: aggregate.pastStopIds,
                        startStationId: aggregate.startStationId,
                        endStationId: aggregate.endStationId,
                        bbox: aggregate.bbox
                        }, endpointStationIds),
                        source: payloadSource,
                        hidden: false
                    });
                    perfProbe?.mark('setTripPreviewSelection');

                    rebuildMultiTripPreview?.(fitMode);
                    perfProbe?.mark('rebuildMultiTripPreview');
                    const result = {
                        ok: true,
                        payload,
                        built: aggregate,
                        source: payloadSource
                    };
                    perfProbe?.finish(result);
                    return result;
                }

                const aggregate = buildAggregateFromPayloadList?.(virtualTrips);
                perfProbe?.mark('buildAggregateFromPayloadList', {
                    rawLineFeatures: aggregate?.rawLineFeatureCount || 0,
                    rawStopFeatures: aggregate?.rawStopFeatureCount || 0,
                    lineFeatures: aggregate?.lineFc?.features?.length || 0,
                    stopFeatures: aggregate?.stopFc?.features?.length || 0,
                    lineFeatureDuplicates: aggregate?.lineFeatureDuplicateCount || 0,
                    stopFeatureDuplicates: aggregate?.stopFeatureDuplicateCount || 0,
                    lineFeatureCacheHits: aggregate?.lineFeatureCacheHitCount || 0,
                    stopFeatureCacheHits: aggregate?.stopFeatureCacheHitCount || 0
                });
                if (!hasVisibleBuiltPreview(aggregate)) {
                    clearTripPathPreview?.({ source: payloadSource || '' });
                    const result = {
                        ok: false,
                        reason: 'empty-built',
                        payload,
                        built: aggregate,
                        source: payloadSource
                    };
                    perfProbe?.finish(result);
                    return result;
                }
                const endpointStationIds = buildPreviewEndpointStationIds({
                    payload,
                    built: aggregate,
                    payloadList: virtualTrips
                });
                perfProbe?.mark('buildEndpointStationIds', {
                    endpointStationIds: endpointStationIds.size
                });
                const built = attachEndpointStationIds({
                    lineFc: aggregate.lineFc,
                    stopFc: aggregate.stopFc,
                    lineIds: aggregate.lineIds,
                    stopIds: aggregate.stopIds,
                    pastStopIds: aggregate.pastStopIds,
                    startStationId: aggregate.startStationId,
                    endStationId: aggregate.endStationId,
                    bbox: aggregate.bbox,
                    rawLineFeatureCount: aggregate.rawLineFeatureCount,
                    rawStopFeatureCount: aggregate.rawStopFeatureCount,
                    dedupedLineFeatureCount: aggregate.dedupedLineFeatureCount,
                    dedupedStopFeatureCount: aggregate.dedupedStopFeatureCount,
                    lineFeatureDuplicateCount: aggregate.lineFeatureDuplicateCount,
                    stopFeatureDuplicateCount: aggregate.stopFeatureDuplicateCount,
                    lineFeatureCacheHitCount: aggregate.lineFeatureCacheHitCount,
                    stopFeatureCacheHitCount: aggregate.stopFeatureCacheHitCount
                }, endpointStationIds);
                perfProbe?.mark('attachEndpointStationIds');

                tripPreviewRenderer.ensureLayers();
                perfProbe?.mark('ensureLayers');
                const stationIds = resolveVirtualTripStationIds?.({
                    payload,
                    payloadSource,
                    aggregate,
                    virtualTrips
                }) || built.stopIds;
                perfProbe?.mark('resolveVirtualTripStationIds', {
                    stationIds: stationIds?.size || 0
                });
                applyActiveState?.({
                    active: true,
                    source: payloadSource,
                    stationOverrideColor: resolveStationOverrideColor?.(payload, payloadSource) || '',
                    stationIds,
                    endpointStationIds,
                    pastStationIds: aggregate.pastStopIds,
                    lineIds: aggregate.lineIds
                });
                perfProbe?.mark('applyActiveState');
                syncStationOffset?.();
                perfProbe?.mark('syncStationOffset');

                try {
                    tripPreviewRenderer.setData({ lineFc: built.lineFc, stopFc: built.stopFc });
                } catch {
                    // Keep legacy route preview interactions non-fatal during renderer migration.
                }
                perfProbe?.mark('tripPreviewRenderer.setData');

                clearEndpointPopups?.();
                perfProbe?.mark('clearEndpointPopups');
                emitTripPreviewUpdated?.({ payload, built });
                perfProbe?.mark('emitTripPreviewUpdated');
                setStationLabelMode?.('all');
                perfProbe?.mark('setStationLabelMode');
                applySelectionEffects?.();
                perfProbe?.mark('applySelectionEffects');
                scheduleCollisionLayerRefresh?.();
                perfProbe?.mark('scheduleCollisionLayerRefresh');
                if (fitMode !== 'none') {
                    previewFitWithSidePanels?.(built.bbox);
                    perfProbe?.mark('previewFitWithSidePanels');
                }
                const result = {
                    ok: true,
                    payload,
                    built,
                    source: payloadSource
                };
                perfProbe?.finish(result);
                return result;
            }

            if (inMultiSelectMode) {
                if (previewInteraction === 'hover') {
                    return {
                        ok: false,
                        reason: 'multiselect-hover-ignored',
                        payload,
                        source: payloadSource
                    };
                }

                const selectionKey = String(buildSelectionKey?.(payload) || '').trim();
                if (!selectionKey) {
                    return {
                        ok: false,
                        reason: 'missing-selection-key',
                        payload,
                        source: payloadSource
                    };
                }

                if (previewInteraction !== 'auto' && this.hasTripPreviewSelection(selectionKey)) {
                    this.deleteTripPreviewSelection(selectionKey);
                } else {
                    const builtSingle = buildFeatures?.(payload);
                    perfProbe?.mark('buildFeatures', {
                        lineFeatures: builtSingle?.lineFc?.features?.length || 0,
                        stopFeatures: builtSingle?.stopFc?.features?.length || 0
                    });
                    if (!builtSingle) {
                        this.deleteTripPreviewSelection(selectionKey);
                        rebuildMultiTripPreview?.('none');
                        const result = {
                            ok: false,
                            reason: 'invalid-builtin-preview',
                            payload,
                            source: payloadSource
                        };
                        perfProbe?.finish(result);
                        return result;
                    }
                    const endpointStationIds = buildPreviewEndpointStationIds({ payload, built: builtSingle });
                    perfProbe?.mark('buildEndpointStationIds', {
                        endpointStationIds: endpointStationIds.size
                    });
                    this.setTripPreviewSelection(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: attachEndpointStationIds(builtSingle, endpointStationIds),
                        source: payloadSource,
                        hidden: false
                    });
                    perfProbe?.mark('setTripPreviewSelection');
                }

                rebuildMultiTripPreview?.(fitMode);
                perfProbe?.mark('rebuildMultiTripPreview');
                const result = {
                    ok: true,
                    payload,
                    source: payloadSource
                };
                perfProbe?.finish(result);
                return result;
            }

            tripPreviewRenderer.ensureLayers();
            perfProbe?.mark('ensureLayers');
            const built = buildFeatures?.(payload);
            perfProbe?.mark('buildFeatures', {
                lineFeatures: built?.lineFc?.features?.length || 0,
                stopFeatures: built?.stopFc?.features?.length || 0
            });
            if (!built) {
                clearTripPathPreview?.({ source: payloadSource || '' });
                const result = {
                    ok: false,
                    reason: 'invalid-builtin-preview',
                    payload,
                    source: payloadSource
                };
                perfProbe?.finish(result);
                return result;
            }
            const endpointStationIds = buildPreviewEndpointStationIds({ payload, built });
            perfProbe?.mark('buildEndpointStationIds', {
                endpointStationIds: endpointStationIds.size
            });
            const endpointAwareBuilt = attachEndpointStationIds({
                lineFc: built.lineFc,
                stopFc: built.stopFc,
                lineIds: built.lineIds,
                stopIds: built.stopIds,
                pastStopIds: built.pastStopIds,
                startStationId: built.startStationId,
                endStationId: built.endStationId,
                bbox: built.bbox
            }, endpointStationIds);
            perfProbe?.mark('attachEndpointStationIds');
            applyActiveState?.({
                active: true,
                source: payloadSource,
                stationOverrideColor: resolveStationOverrideColor?.(payload, payloadSource) || '',
                stationIds: built?.stopIds,
                endpointStationIds,
                pastStationIds: built?.pastStopIds,
                lineIds: built?.lineIds
            });
            perfProbe?.mark('applyActiveState');
            syncStationOffset?.();
            perfProbe?.mark('syncStationOffset');

            try {
                tripPreviewRenderer.setData({ lineFc: endpointAwareBuilt?.lineFc, stopFc: endpointAwareBuilt?.stopFc });
            } catch {
                // Keep legacy route preview interactions non-fatal during renderer migration.
            }
            perfProbe?.mark('tripPreviewRenderer.setData');

            updateEndpointPopups?.(built?.startStationId, built?.endStationId, {
                displayMode: normalizeKey(payload?.endpointDisplayMode)
            });
            perfProbe?.mark('updateEndpointPopups');
            emitTripPreviewUpdated?.({ payload, built: endpointAwareBuilt });
            perfProbe?.mark('emitTripPreviewUpdated');
            setStationLabelMode?.('all');
            perfProbe?.mark('setStationLabelMode');
            applySelectionEffects?.();
            perfProbe?.mark('applySelectionEffects');
            scheduleCollisionLayerRefresh?.();
            perfProbe?.mark('scheduleCollisionLayerRefresh');
            if (fitMode !== 'none') {
                previewFitWithSidePanels?.(endpointAwareBuilt?.bbox);
                perfProbe?.mark('previewFitWithSidePanels');
            }
            const result = {
                ok: true,
                payload,
                built: endpointAwareBuilt,
                source: payloadSource
            };
            perfProbe?.finish(result);
            return result;
        },
        applyTripPreviewSnapshot({
            snapshot = {},
            options = {},
            isMultiSelectModeEnabled,
            clearTripPathPreview,
            resolvePayloadSource,
            applyActiveState,
            syncStationOffset,
            clearEndpointPopups,
            setStationLabelMode,
            applySelectionEffects,
            scheduleCollisionLayerRefresh,
            previewFitWithSidePanels,
            resolveStationOverrideColor,
            resolveVirtualTripStationIds,
            updateEndpointPopups
        } = {}) {
            const payload = snapshot?.payload;
            const built = snapshot?.built;
            if (!payload || !built) {
                return {
                    ok: false,
                    reason: 'invalid-snapshot'
                };
            }

            if (options?.clearBefore === true) {
                clearTripPathPreview?.({ source: String(snapshot?.source || '') || String(resolvePayloadSource?.(payload) || payload?.previewSource || payload?.__previewSource || '') });
            }

            const fitMode = String(options?.fitMode || payload?.fitMode || 'preview').trim() || 'preview';
            const payloadSource = String(resolvePayloadSource?.(payload) || snapshot?.source || payload?.previewSource || payload?.__previewSource || '').trim();
            const inMultiSelectMode = !!isMultiSelectModeEnabled?.();
            if (inMultiSelectMode) {
                return {
                    ok: false,
                    reason: 'multiselect-not-supported'
                };
            }

            if (!hasVisibleBuiltPreview(built)) {
                clearTripPathPreview?.({ source: payloadSource || '' });
                return {
                    ok: false,
                    reason: 'empty-built',
                    payload,
                    built,
                    source: payloadSource
                };
            }

            const virtualTrips = getVirtualTrips(payload);
            const endpointStationIds = buildPreviewEndpointStationIds({
                payload,
                built,
                payloadList: virtualTrips
            });
            const endpointAwareBuilt = attachEndpointStationIds({
                lineFc: built.lineFc,
                stopFc: built.stopFc,
                lineIds: built.lineIds,
                stopIds: built.stopIds,
                pastStopIds: built.pastStopIds,
                startStationId: built.startStationId,
                endStationId: built.endStationId,
                bbox: built.bbox
            }, endpointStationIds);

            tripPreviewRenderer.ensureLayers();
            const stationIds = resolveVirtualTripStationIds?.({
                payload,
                payloadSource,
                aggregate: endpointAwareBuilt,
                virtualTrips
            }) || endpointAwareBuilt.stopIds;
            applyActiveState?.({
                active: true,
                source: payloadSource,
                stationOverrideColor: resolveStationOverrideColor?.(payload, payloadSource) || '',
                stationIds,
                endpointStationIds,
                pastStationIds: endpointAwareBuilt.pastStopIds,
                lineIds: endpointAwareBuilt.lineIds
            });
            syncStationOffset?.();

            try {
                tripPreviewRenderer.setData({ lineFc: endpointAwareBuilt.lineFc, stopFc: endpointAwareBuilt.stopFc });
            } catch {
                // Keep legacy route preview interactions non-fatal during renderer migration.
            }

            clearEndpointPopups?.();
            if (virtualTrips.length === 0) {
                updateEndpointPopups?.(endpointAwareBuilt.startStationId, endpointAwareBuilt.endStationId, {
                    displayMode: 'auto'
                });
            }
            emitTripPreviewUpdated?.({ payload, built: endpointAwareBuilt });
            setStationLabelMode?.('all');
            applySelectionEffects?.();
            scheduleCollisionLayerRefresh?.();
            if (fitMode !== 'none') {
                previewFitWithSidePanels?.(endpointAwareBuilt?.bbox);
            }

            return {
                ok: true,
                payload,
                built: endpointAwareBuilt,
                source: payloadSource
            };
        },
        clearDirHeaderPreview({
            isActive,
            applyInactiveState,
            clearEndpointPopups,
            applySelectionEffects,
            scheduleCollisionLayerRefresh
        } = {}) {
            if (!isActive?.()) return;
            applyInactiveState?.();
            clearEndpointPopups?.();
            applySelectionEffects?.();
            scheduleCollisionLayerRefresh?.();
        },
        previewDirHeader({
            payload,
            clearDirHeaderPreview,
            applyActiveState,
            clearEndpointPopups,
            createEndpointPopup,
            addOriginPopup,
            addTerminalPopup,
            bboxFromStationIds,
            previewFitWithSidePanels,
            applySelectionEffects,
            scheduleCollisionLayerRefresh
        } = {}) {
            const normalized = normalizeDirPreviewPayload(payload);
            if (!normalized.lineId) {
                clearDirHeaderPreview?.();
                return;
            }

            const lineIds = new Set([normalized.lineId]);
            for (const id of normalized.sourceLineIds) lineIds.add(id);
            applyActiveState?.({
                active: true,
                lineIds,
                stationIds: normalized.stationIds
            });

            clearEndpointPopups?.();
            const roleMap = new Map();
            for (const sid of normalized.originIds) {
                if (!roleMap.has(sid)) roleMap.set(sid, new Set());
                roleMap.get(sid).add('origin');
            }
            for (const sid of normalized.terminalIds) {
                if (!roleMap.has(sid)) roleMap.set(sid, new Set());
                roleMap.get(sid).add('terminal');
            }
            const endpointCountsByStationId = new Map(
                normalized.endpointLabelCounts.map((item) => [item.stationId, item])
            );
            const getEndpointLabelText = (stationId, role) => {
                const counts = endpointCountsByStationId.get(stationId) || {};
                const count = role === 'origin'
                    ? Number(counts.originCount || 0)
                    : Number(counts.terminalCount || 0);
                const label = role === 'origin' ? '始发' : '终点';
                return count > 0 ? `${label}(${count})` : label;
            };

            for (const [sid, roles] of roleMap.entries()) {
                const hasOrigin = roles.has('origin');
                const hasTerminal = roles.has('terminal');
                if (hasOrigin) {
                    const popup = createEndpointPopup?.({
                        stationId: sid,
                        text: getEndpointLabelText(sid, 'origin'),
                        color: '#1A9B2D',
                        yOffset: 10
                    });
                    if (popup) addOriginPopup?.(popup);
                }
                if (hasTerminal) {
                    const popup = createEndpointPopup?.({
                        stationId: sid,
                        text: getEndpointLabelText(sid, 'terminal'),
                        color: '#D32F2F',
                        yOffset: hasOrigin ? 30 : 10
                    });
                    if (popup) addTerminalPopup?.(popup);
                }
            }

            applySelectionEffects?.();
            scheduleCollisionLayerRefresh?.();

            if (normalized.fitMode !== 'none') {
                const fitBbox = bboxFromStationIds?.(Array.from(normalized.stationIds));
                previewFitWithSidePanels?.(fitBbox);
            }
        }
    };
};

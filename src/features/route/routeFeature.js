import { normalizeDirPreviewPayload } from '../../domain/routePreviewSelection.js';

export const createRouteFeature = ({
    tripPreviewRenderer,
    emitTripPreviewUpdated,
    emitTripPreviewCleared
} = {}) => {
    if (!tripPreviewRenderer) {
        throw new Error('routeFeature requires tripPreviewRenderer');
    }

    const tripPreviewSelectionsByKey = new Map();

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
            const lineFeatureByKey = new Map();
            const stopFeatureByStationId = new Map();
            const lineIds = new Set();
            const stopIds = new Set();
            let bbox = null;

            for (const entry of tripPreviewSelectionsByKey.values()) {
                if (entry?.hidden === true) continue;
                const built = entry?.built;
                const lineFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features : [];
                const stopFeatures = Array.isArray(built?.stopFc?.features) ? built.stopFc.features : [];

                for (const lf of lineFeatures) {
                    const key = typeof buildLineFeatureDedupKey === 'function'
                        ? buildLineFeatureDedupKey(lf)
                        : '';
                    if (!key || lineFeatureByKey.has(key)) continue;
                    lineFeatureByKey.set(key, lf);
                }

                for (const sf of stopFeatures) {
                    const sid = String(sf?.properties?.id || '').trim();
                    if (!sid) continue;
                    if (!stopFeatureByStationId.has(sid)) stopFeatureByStationId.set(sid, sf);
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
                lineFc: { type: 'FeatureCollection', features: Array.from(lineFeatureByKey.values()) },
                stopFc: { type: 'FeatureCollection', features: Array.from(stopFeatureByStationId.values()) },
                lineIds,
                stopIds,
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
            scheduleLayerCollisionUpdate,
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
                lineIds: hasVisible ? built.lineIds : null,
                stationOverrideColor: ''
            });
            syncStationOffset?.();

            if (!hasVisible) {
                setStationLabelMode?.(hasBaseMultiSelection ? 'all' : 'auto');
                applySelectionEffects?.();
                scheduleLayerCollisionUpdate?.();
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
            scheduleLayerCollisionUpdate?.();
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
            scheduleLayerCollisionUpdate,
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
            scheduleLayerCollisionUpdate?.();
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
            scheduleLayerCollisionUpdate,
            previewFitWithSidePanels
        } = {}) {
            const hasSegments = Array.isArray(payload?.segments) && payload.segments.length;
            const virtualTrips = getVirtualTrips(payload);

            if (!payload || (!hasSegments && !virtualTrips.length)) {
                clearTripPathPreview?.();
                return;
            }

            const fitMode = getFitMode(payload);
            const payloadSource = typeof resolvePayloadSource === 'function'
                ? String(resolvePayloadSource(payload) || '').trim()
                : '';
            const previewInteraction = getPreviewInteraction(payload);
            const inMultiSelectMode = !!isMultiSelectModeEnabled?.();

            if (virtualTrips.length) {
                if (inMultiSelectMode) {
                    if (previewInteraction === 'hover') return;

                    const selectionKey = String(buildSelectionKey?.(payload) || '').trim();
                    if (!selectionKey) return;

                    const aggregate = buildAggregateFromPayloadList?.(virtualTrips);
                    if (!hasVisibleBuiltPreview(aggregate)) {
                        this.deleteTripPreviewSelection(selectionKey);
                        rebuildMultiTripPreview?.('none');
                        return;
                    }

                    this.setTripPreviewSelection(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: {
                            lineFc: aggregate.lineFc,
                            stopFc: aggregate.stopFc,
                            lineIds: aggregate.lineIds,
                            stopIds: aggregate.stopIds,
                            startStationId: aggregate.startStationId,
                            endStationId: aggregate.endStationId,
                            bbox: aggregate.bbox
                        },
                        source: payloadSource,
                        hidden: false
                    });

                    rebuildMultiTripPreview?.(fitMode);
                    return;
                }

                const aggregate = buildAggregateFromPayloadList?.(virtualTrips);
                if (!hasVisibleBuiltPreview(aggregate)) {
                    clearTripPathPreview?.({ source: payloadSource || '' });
                    return;
                }

                tripPreviewRenderer.ensureLayers();
                applyActiveState?.({
                    active: true,
                    source: payloadSource,
                    stationOverrideColor: resolveStationOverrideColor?.(payload, payloadSource) || '',
                    stationIds: resolveVirtualTripStationIds?.({
                        payload,
                        payloadSource,
                        aggregate,
                        virtualTrips
                    }) || aggregate.stopIds,
                    lineIds: aggregate.lineIds
                });
                syncStationOffset?.();

                try {
                    tripPreviewRenderer.setData({ lineFc: aggregate.lineFc, stopFc: aggregate.stopFc });
                } catch {
                    // Keep legacy route preview interactions non-fatal during renderer migration.
                }

                clearEndpointPopups?.();
                emitTripPreviewUpdated?.({ payload, built: aggregate });
                setStationLabelMode?.('all');
                applySelectionEffects?.();
                scheduleLayerCollisionUpdate?.();
                if (fitMode !== 'none') {
                    previewFitWithSidePanels?.(aggregate.bbox);
                }
                return;
            }

            if (inMultiSelectMode) {
                if (previewInteraction === 'hover') return;

                const selectionKey = String(buildSelectionKey?.(payload) || '').trim();
                if (!selectionKey) return;

                if (this.hasTripPreviewSelection(selectionKey)) {
                    this.deleteTripPreviewSelection(selectionKey);
                } else {
                    const builtSingle = buildFeatures?.(payload);
                    this.setTripPreviewSelection(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: builtSingle,
                        source: payloadSource,
                        hidden: false
                    });
                }

                rebuildMultiTripPreview?.(fitMode);
                return;
            }

            tripPreviewRenderer.ensureLayers();
            const built = buildFeatures?.(payload);
            applyActiveState?.({
                active: true,
                source: payloadSource,
                stationOverrideColor: resolveStationOverrideColor?.(payload, payloadSource) || '',
                stationIds: built?.stopIds,
                lineIds: built?.lineIds
            });
            syncStationOffset?.();

            try {
                tripPreviewRenderer.setData({ lineFc: built?.lineFc, stopFc: built?.stopFc });
            } catch {
                // Keep legacy route preview interactions non-fatal during renderer migration.
            }

            updateEndpointPopups?.(built?.startStationId, built?.endStationId);
            emitTripPreviewUpdated?.({ payload, built });
            setStationLabelMode?.('all');
            applySelectionEffects?.();
            scheduleLayerCollisionUpdate?.();
            if (fitMode !== 'none') {
                previewFitWithSidePanels?.(built?.bbox);
            }
        },
        clearDirHeaderPreview({
            isActive,
            applyInactiveState,
            clearEndpointPopups,
            applySelectionEffects,
            scheduleLayerCollisionUpdate
        } = {}) {
            if (!isActive?.()) return;
            applyInactiveState?.();
            clearEndpointPopups?.();
            applySelectionEffects?.();
            scheduleLayerCollisionUpdate?.();
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
            scheduleLayerCollisionUpdate
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

            for (const [sid, roles] of roleMap.entries()) {
                const hasOrigin = roles.has('origin');
                const hasTerminal = roles.has('terminal');
                if (hasOrigin) {
                    const popup = createEndpointPopup?.({
                        stationId: sid,
                        text: '始发站',
                        color: '#1A9B2D',
                        yOffset: 10
                    });
                    if (popup) addOriginPopup?.(popup);
                }
                if (hasTerminal) {
                    const popup = createEndpointPopup?.({
                        stationId: sid,
                        text: '终点站',
                        color: '#D32F2F',
                        yOffset: hasOrigin ? 30 : 10
                    });
                    if (popup) addTerminalPopup?.(popup);
                }
            }

            applySelectionEffects?.();
            scheduleLayerCollisionUpdate?.();

            if (normalized.fitMode !== 'none') {
                const fitBbox = bboxFromStationIds?.(Array.from(normalized.stationIds));
                previewFitWithSidePanels?.(fitBbox);
            }
        }
    };
};

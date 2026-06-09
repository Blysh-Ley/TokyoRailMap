import { buildTripPreviewKey, buildVirtualTimetableChain } from '../../lib/trip-preview.js';
import { withTripPreviewLineIdentity } from './panelTripPreviewLineIdentity.js';

const defaultToText = (value) => String(value ?? '').trim();

const buildSegmentsWithIdentity = (segments = [], {
    toText = defaultToText
} = {}) => segments.map((seg) => withTripPreviewLineIdentity(seg, { toText }));

const buildPreviewSegmentsFromSegmentsWithPast = ({
    kindFilter,
    payloadTypeColor = '',
    segmentsWithPast = [],
    toText = defaultToText
} = {}) => {
    const out = [];
    for (const seg of (Array.isArray(segmentsWithPast) ? segmentsWithPast : [])) {
        if (toText(seg?.kind) !== toText(kindFilter)) continue;
        const stationIds = Array.isArray(seg?.rows)
            ? seg.rows.map((row) => toText(row?.stationId)).filter(Boolean)
            : [];
        if (stationIds.length < 2) continue;
        out.push({
            kind: toText(seg?.kind || kindFilter),
            lineId: toText(seg?.lineId),
            r: toText(seg?.r || seg?.lineId),
            geometryLineId: toText(seg?.geometryLineId || seg?.geometry_line_id),
            offsetLineId: toText(seg?.offsetLineId || seg?.line_offset_id),
            d: toText(seg?.d),
            stationIds,
            typeColor: toText(seg?.typeColor || payloadTypeColor)
        });
    }
    return buildSegmentsWithIdentity(out, { toText });
};

export const buildPanelTripPreviewScheduleArgs = ({
    trip,
    tripKey,
    lineId,
    typeName = '',
    typeColor = '',
    hasNt = false,
    fitMode = '',
    throughCategoryColor = '',
    throughCategoryLabel = '',
    segmentsWithPast = [],
    activeBranchLanes = [],
    branchMode = '',
    pinned = false,
    tripLocked = false,
    getTripLineId = () => '',
    getLineMeta = () => null,
    toText = defaultToText
} = {}) => {
    const addPreviewLineIdentity = (seg) => withTripPreviewLineIdentity(seg, { toText });

    const payloadSegments = buildSegmentsWithIdentity((segmentsWithPast || []).map((seg) => ({
        kind: seg.kind,
        lineId: toText(seg.lineId),
        r: toText(seg.r || seg.lineId),
        d: toText(seg?.d || trip?.d),
        stationIds: (seg.rows || []).map((row) => toText(row.stationId)).filter(Boolean),
        typeColor: throughCategoryColor || toText(seg.typeColor)
    })), { toText });

    const payloadChainLineIds = payloadSegments
        .map((seg) => toText(seg?.r || seg?.lineId))
        .filter(Boolean);
    const mainSeg = segmentsWithPast.find((segment) => segment.kind === 'main') || null;
    const mainRows = Array.isArray(mainSeg?.rows) ? mainSeg.rows : [];
    const mainOriginStationId = mainRows.length ? toText(mainRows[0]?.stationId) : '';
    const mainTerminalStationId = mainRows.length ? toText(mainRows[mainRows.length - 1]?.stationId) : '';
    const mainLineId = toText(getTripLineId(trip) || lineId);

    const payload = {
        tripKey: toText(tripKey),
        selectedLineId: toText(lineId),
        selectedLineName: toText(getLineMeta(toText(lineId))?.name || toText(lineId)),
        mainLineId,
        originStationId: mainOriginStationId,
        mainTerminalStationId,
        terminalStationId: mainTerminalStationId,
        typeName: toText(typeName),
        typeColor: throughCategoryColor || toText(typeColor),
        hasNt,
        r: mainLineId,
        chainLineIds: payloadChainLineIds,
        virtualTimetable: buildVirtualTimetableChain(payloadSegments, toText(tripKey)),
        segments: payloadSegments,
        previewSource: 'panel-trip',
        fitMode: toText(fitMode)
    };

    if (!throughCategoryLabel && branchMode && Array.isArray(activeBranchLanes) && activeBranchLanes.length >= 2) {
        const mainSegForPreview = segmentsWithPast.find((segment) => toText(segment?.kind) === 'main') || null;
        const mainSegStationIds = Array.isArray(mainSegForPreview?.rows)
            ? mainSegForPreview.rows.map((row) => toText(row?.stationId)).filter(Boolean)
            : [];
        const mainSegLineId = toText(mainSegForPreview?.lineId || payload?.mainLineId || payload?.selectedLineId);
        const mainSegDir = toText(mainSegForPreview?.d || trip?.d);

        const previewPtContextSegments = buildPreviewSegmentsFromSegmentsWithPast({
            kindFilter: 'pt',
            payloadTypeColor: payload.typeColor,
            segmentsWithPast,
            toText
        });
        const previewNtContextSegments = buildPreviewSegmentsFromSegmentsWithPast({
            kindFilter: 'nt',
            payloadTypeColor: payload.typeColor,
            segmentsWithPast,
            toText
        });

        const virtualTrips = [];
        for (let index = 0; index < activeBranchLanes.length; index += 1) {
            const lane = activeBranchLanes[index] || {};
            const laneStationIds = Array.isArray(lane?.rows)
                ? lane.rows.map((row) => toText(row?.stationId)).filter(Boolean)
                : [];
            const laneLineId = toText(lane?.lineId || mainSegLineId);
            const laneDir = toText(lane?.d || mainSegDir);
            const lanePreviewSegments = Array.isArray(lane?.previewSegments)
                ? lane.previewSegments.filter((seg) => Array.isArray(seg?.stationIds) && seg.stationIds.length >= 2)
                : [];

            const chainSegments = [];
            if (branchMode === 'merge') {
                if (lanePreviewSegments.length) {
                    chainSegments.push(...lanePreviewSegments.map((seg) => addPreviewLineIdentity({
                        kind: 'pt',
                        lineId: toText(seg?.lineId || laneLineId),
                        r: toText(seg?.r || seg?.lineId || laneLineId),
                        geometryLineId: toText(seg?.geometryLineId || seg?.geometry_line_id),
                        offsetLineId: toText(seg?.offsetLineId || seg?.line_offset_id),
                        d: toText(seg?.d || laneDir),
                        stationIds: Array.isArray(seg?.stationIds) ? seg.stationIds.map((value) => toText(value)).filter(Boolean) : [],
                        typeColor: toText(seg?.typeColor || lane?.typeColor || payload?.typeColor)
                    })));
                } else if (laneStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'pt',
                        lineId: laneLineId,
                        r: laneLineId,
                        d: laneDir,
                        stationIds: laneStationIds,
                        typeColor: toText(lane?.typeColor || payload?.typeColor)
                    }));
                }
                if (mainSegStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'main',
                        lineId: mainSegLineId,
                        r: toText(mainSegForPreview?.r || mainSegLineId),
                        d: mainSegDir,
                        stationIds: mainSegStationIds,
                        typeColor: toText(payload?.typeColor)
                    }));
                }
                chainSegments.push(...previewNtContextSegments);
            } else {
                chainSegments.push(...previewPtContextSegments);
                if (mainSegStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'main',
                        lineId: mainSegLineId,
                        r: toText(mainSegForPreview?.r || mainSegLineId),
                        d: mainSegDir,
                        stationIds: mainSegStationIds,
                        typeColor: toText(payload?.typeColor)
                    }));
                }
                if (lanePreviewSegments.length) {
                    chainSegments.push(...lanePreviewSegments.map((seg) => addPreviewLineIdentity({
                        kind: 'nt',
                        lineId: toText(seg?.lineId || laneLineId),
                        r: toText(seg?.r || seg?.lineId || laneLineId),
                        geometryLineId: toText(seg?.geometryLineId || seg?.geometry_line_id),
                        offsetLineId: toText(seg?.offsetLineId || seg?.line_offset_id),
                        d: toText(seg?.d || laneDir),
                        stationIds: Array.isArray(seg?.stationIds) ? seg.stationIds.map((value) => toText(value)).filter(Boolean) : [],
                        typeColor: toText(seg?.typeColor || lane?.typeColor || payload?.typeColor)
                    })));
                } else if (laneStationIds.length >= 2) {
                    chainSegments.push(addPreviewLineIdentity({
                        kind: 'nt',
                        lineId: laneLineId,
                        r: laneLineId,
                        d: laneDir,
                        stationIds: laneStationIds,
                        typeColor: toText(lane?.typeColor || payload?.typeColor)
                    }));
                }
            }

            const normalizedChainSegments = chainSegments.filter((seg) => {
                const stationIds = Array.isArray(seg?.stationIds) ? seg.stationIds.map((value) => toText(value)).filter(Boolean) : [];
                seg.stationIds = stationIds;
                return stationIds.length >= 2 && !!toText(seg?.lineId);
            });
            if (!normalizedChainSegments.length) continue;

            const firstIds = normalizedChainSegments[0]?.stationIds || [];
            const lastIds = normalizedChainSegments[normalizedChainSegments.length - 1]?.stationIds || [];
            const normalizedChainLineIds = normalizedChainSegments
                .map((seg) => toText(seg?.r || seg?.lineId))
                .filter(Boolean);
            const virtualTripKey = `${toText(tripKey)}::branch-${index + 1}`;

            virtualTrips.push({
                tripKey: virtualTripKey,
                selectedLineId: payload.selectedLineId,
                selectedLineName: payload.selectedLineName,
                mainLineId: payload.mainLineId,
                r: normalizedChainLineIds[0] || payload.r || payload.mainLineId,
                chainLineIds: normalizedChainLineIds,
                virtualTimetable: buildVirtualTimetableChain(normalizedChainSegments, virtualTripKey),
                originStationId: toText(firstIds[0]),
                mainTerminalStationId: toText(lastIds[lastIds.length - 1]),
                terminalStationId: toText(lastIds[lastIds.length - 1]),
                typeName: payload.typeName,
                typeColor: payload.typeColor,
                hasNt: branchMode === 'split',
                forceIncludeNt: branchMode === 'split',
                segments: normalizedChainSegments,
                fitMode: payload.fitMode,
                previewSource: payload.previewSource,
                __previewSource: payload.__previewSource,
                previewInteraction: payload.previewInteraction,
                __previewInteraction: payload.__previewInteraction
            });
        }

        if (virtualTrips.length >= 2) {
            payload.virtualTrips = virtualTrips;
        }
    }

    return {
        previewKey: buildTripPreviewKey(lineId, tripKey),
        payload,
        immediate: !!pinned || tripLocked
    };
};

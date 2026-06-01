import { previewBranchesForLine } from '../../map/analyze_branch.js';

const defaultToText = (value) => String(value ?? '').trim();

export const createPanelRoutePreviewController = ({
    clearTripPathPreviewBySource = () => false,
    previewSource = 'panel-dir-branch',
    requestRoutePreview = previewBranchesForLine,
    toText = defaultToText
} = {}) => {
    let activeKey = '';
    let requestSeq = 0;

    const applyDirectionPreview = async ({
        currentStationIds = [],
        fitMode = '',
        force = false,
        key,
        meta,
        onEnter = null,
        sourceLineIds = [],
        targetTripKeys = [],
        throughServiceCategory = ''
    } = {}) => {
        const nextKey = toText(key);
        if (!nextKey || !meta) return false;
        if (!force && activeKey === nextKey) return false;
        activeKey = nextKey;

        const normalizedSourceLineIds = Array.isArray(sourceLineIds)
            ? sourceLineIds.map((x) => toText(x)).filter(Boolean)
            : [];
        const originStationIds = Array.isArray(meta.originStationIds) ? meta.originStationIds.slice() : [];
        const terminalStationIds = Array.isArray(meta.terminalStationIds) ? meta.terminalStationIds.slice() : [];
        const normalizedCurrentStationIds = Array.isArray(currentStationIds)
            ? currentStationIds.map((x) => toText(x)).filter(Boolean)
            : [];

        try {
            onEnter?.({
                currentStationIds: normalizedCurrentStationIds.slice(),
                fitMode: toText(fitMode),
                lineId: toText(meta.lineId),
                originStationIds,
                sourceLineIds: normalizedSourceLineIds.slice(),
                terminalStationIds
            });
        } catch {
            // keep preview request behavior independent from optional UI callbacks
        }

        const seq = ++requestSeq;
        const highlightStationIds = Array.from(new Set([
            ...originStationIds,
            ...terminalStationIds,
            ...normalizedCurrentStationIds
        ].map((x) => toText(x)).filter(Boolean)));

        try {
            await requestRoutePreview({
                fitMode: toText(fitMode),
                highlightStationIds,
                lineId: toText(meta.lineId),
                lineName: '',
                originStationIds,
                previewSource,
                sourceLineIds: normalizedSourceLineIds,
                targetTripKeys: Array.isArray(targetTripKeys) ? targetTripKeys.slice() : [],
                terminalStationIds,
                throughServiceCategory: toText(throughServiceCategory)
            });
        } catch {
            if (seq === requestSeq) {
                clearTripPathPreviewBySource(previewSource);
            }
        }

        return seq === requestSeq;
    };

    const clearDirectionPreview = ({ onLeave = null } = {}) => {
        if (!activeKey) return false;
        activeKey = '';
        requestSeq += 1;
        try {
            onLeave?.();
        } catch {
            // keep clear behavior independent from optional UI callbacks
        }
        clearTripPathPreviewBySource(previewSource);
        return true;
    };

    return {
        applyDirectionPreview,
        clearDirectionPreview,
        getActiveKey: () => activeKey,
        getRequestSeq: () => requestSeq,
        previewSource
    };
};

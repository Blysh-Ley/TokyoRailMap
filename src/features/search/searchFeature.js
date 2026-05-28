import {
    selectionClear,
    selectionCommitCompany,
    selectionCommitLine,
    selectionPreviewCompany,
    selectionPreviewLine,
    selectionSelectStationLines
} from '../../store/actions.js';
import { normalizeLineIdList } from '../../domain/selection.js';

const toText = (value) => String(value ?? '').trim();

export const createSearchFeature = ({ store, resolveLineSelection } = {}) => {
    if (!store || typeof store.dispatch !== 'function') {
        throw new Error('searchFeature requires a store');
    }

    const buildLinePayload = (lineId) => {
        const id = toText(lineId);
        if (!id) return null;
        const resolved = typeof resolveLineSelection === 'function'
            ? resolveLineSelection(id)
            : null;
        const selectedLineId = toText(resolved?.mainLineId) || id;
        const mergedLineIds = normalizeLineIdList(
            Array.isArray(resolved?.mergedLineIds) ? resolved.mergedLineIds : [selectedLineId]
        );
        return {
            selectedLineId,
            selectedCompany: null,
            selectedStationLineIds: mergedLineIds.length > 1 ? mergedLineIds : null,
            selectedStationId: null,
            selectedServiceMode: 'all',
            mergedLineIds
        };
    };

    const buildCompanyPayload = (companyName) => {
        const name = toText(companyName);
        if (!name) return null;
        return {
            selectedCompany: name,
            selectedLineId: null,
            selectedStationLineIds: null,
            selectedStationId: null,
            selectedServiceMode: 'all'
        };
    };

    return {
        previewLine(lineId) {
            const payload = buildLinePayload(lineId);
            if (!payload) return null;
            store.dispatch(selectionPreviewLine(payload));
            return payload;
        },
        commitLine(lineId) {
            const payload = buildLinePayload(lineId);
            if (!payload) return null;
            store.dispatch(selectionCommitLine(payload));
            return payload;
        },
        previewCompany(companyName) {
            const payload = buildCompanyPayload(companyName);
            if (!payload) return null;
            store.dispatch(selectionPreviewCompany(payload));
            return payload;
        },
        commitCompany(companyName) {
            const payload = buildCompanyPayload(companyName);
            if (!payload) return null;
            store.dispatch(selectionCommitCompany(payload));
            return payload;
        },
        selectStationLines({ stationId, lineIds } = {}) {
            const ids = normalizeLineIdList(lineIds);
            if (!ids.length) return null;
            const payload = {
                selectedCompany: null,
                selectedLineId: null,
                selectedStationLineIds: ids,
                selectedStationId: toText(stationId) || null,
                selectedServiceMode: 'all'
            };
            store.dispatch(selectionSelectStationLines(payload));
            return payload;
        },
        clearSelection(options = {}) {
            store.dispatch(selectionClear(options));
        }
    };
};

import { lineIdsToSet } from '../../domain/selection.js';

export const createHighlightFeature = ({ store, applyLegacySelection } = {}) => {
    if (!store || typeof store.subscribe !== 'function') {
        throw new Error('highlightFeature requires a store');
    }
    if (typeof applyLegacySelection !== 'function') {
        throw new Error('highlightFeature requires applyLegacySelection');
    }

    const unsubscribe = store.subscribe((state, action) => {
        if (!String(action?.type || '').startsWith('selection/')) return;
        applyLegacySelection({
            ...state,
            selectedStationLineIds: lineIdsToSet(state.selectedStationLineIds),
            action
        });
    });

    return { destroy: unsubscribe };
};

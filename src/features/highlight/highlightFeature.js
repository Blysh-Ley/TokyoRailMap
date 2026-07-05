import { lineIdsToSet } from '../../domain/selection.js';
import { ACTION_TYPES } from '../../store/actions.js';

export const createHighlightFeature = ({ store, applyLegacySelection } = {}) => {
    if (!store || typeof store.subscribe !== 'function') {
        throw new Error('highlightFeature requires a store');
    }
    if (typeof applyLegacySelection !== 'function') {
        throw new Error('highlightFeature requires applyLegacySelection');
    }

    const unsubscribe = store.subscribe((state, action) => {
        const type = String(action?.type || '');
        if (!type.startsWith('selection/') && type !== ACTION_TYPES.STATION_VISUAL_HIGHLIGHT_SET) return;
        applyLegacySelection({
            ...state,
            selectedStationLineIds: lineIdsToSet(state.selectedStationLineIds),
            action
        });
    });

    return { destroy: unsubscribe };
};

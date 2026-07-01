export const createBaseMultiSelectionCommitter = ({
    setSelectionsByKey,
    emitLayersUpdated = () => {},
    syncBaseTripPreview = () => null
} = {}) => {
    const commitSelectionsByKey = (selectionsByKey) => {
        if (typeof setSelectionsByKey !== 'function') return false;
        setSelectionsByKey(selectionsByKey instanceof Map ? selectionsByKey : new Map());
        emitLayersUpdated?.();
        Promise.resolve(syncBaseTripPreview?.()).catch(() => null);
        return true;
    };

    const commitResult = (result, changedField = 'changed') => {
        if (!result || result[changedField] !== true) return false;
        return commitSelectionsByKey(result.selectionsByKey);
    };

    return {
        commitChangedResult: (result) => commitResult(result, 'changed'),
        commitRemovedResult: (result) => commitResult(result, 'removed'),
        commitSelectionsByKey
    };
};

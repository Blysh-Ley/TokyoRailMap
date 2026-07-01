const toText = (value) => String(value ?? '').trim();

export const createBranchPreviewStepCommitter = ({
    stepsByLineId,
    emitLayersUpdated = () => {}
} = {}) => {
    const getStore = () => (
        stepsByLineId instanceof Map ? stepsByLineId : null
    );

    const shouldEmit = (options) => options?.emit !== false;

    const setStep = (lineId, step, options = {}) => {
        const store = getStore();
        const id = toText(lineId);
        if (!store || !id) return false;
        store.set(id, Number(step) || 0);
        if (shouldEmit(options)) emitLayersUpdated?.();
        return true;
    };

    const clearStep = (lineId, options = {}) => {
        const store = getStore();
        const id = toText(lineId);
        if (!store || !id) return false;
        store.delete(id);
        if (shouldEmit(options)) emitLayersUpdated?.();
        return true;
    };

    const clearAll = (options = {}) => {
        const store = getStore();
        if (!store || !store.size) return false;
        store.clear();
        if (shouldEmit(options)) emitLayersUpdated?.();
        return true;
    };

    return {
        clearAll,
        clearStep,
        setStep
    };
};

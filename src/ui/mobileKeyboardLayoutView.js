const setKeyboardVisibleDataset = (node, visible) => {
    if (!node?.dataset) return;
    if (visible) node.dataset.mobileKeyboardVisible = '1';
    else delete node.dataset.mobileKeyboardVisible;
};

export const renderMobileKeyboardLayout = (doc, visible) => {
    const nextVisible = visible === true;
    setKeyboardVisibleDataset(doc?.documentElement, nextVisible);
    setKeyboardVisibleDataset(doc?.body, nextVisible);
    return nextVisible;
};

export const createMobileKeyboardLayoutView = ({
    doc = globalThis.document,
    store = null
} = {}) => {
    let currentVisible = null;

    const render = (state = store?.getState?.() || {}) => {
        const nextVisible = state.mobileKeyboardVisible === true;
        if (nextVisible === currentVisible) return currentVisible;
        currentVisible = renderMobileKeyboardLayout(doc, nextVisible);
        return currentVisible;
    };

    const unsubscribe = store?.subscribe?.((state) => render(state)) || (() => {});
    render();

    return {
        destroy() {
            unsubscribe();
            currentVisible = renderMobileKeyboardLayout(doc, false);
        },
        render
    };
};

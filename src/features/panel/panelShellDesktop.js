const DEFAULT_HIDDEN_TRANSFORM = 'translateX(calc(100% + 24px))';

export const createDesktopPanelShell = ({
    documentRef = globalThis.document,
    win = globalThis.window,
    rightPx = 10,
    widthPx = 360,
    zIndex = 4000
} = {}) => {
    if (!documentRef?.createElement) {
        throw new Error('createDesktopPanelShell requires documentRef');
    }

    const root = documentRef.createElement('div');
    root.setAttribute('data-panel-root', '');
    root.style.position = 'fixed';
    root.style.right = `${rightPx}px`;
    root.style.zIndex = String(zIndex);
    root.style.width = `${widthPx}px`;
    root.style.maxWidth = 'calc(100vw - 20px)';
    root.style.transform = DEFAULT_HIDDEN_TRANSFORM;
    root.style.transition = 'transform 0.2s ease';

    const layout = () => {
        const heightSource = Number(win?.innerHeight) || 0;
        const top = Math.round(heightSource * 0.1);
        const height = Math.round(heightSource * 0.8);
        root.style.top = `${top}px`;
        root.style.height = `${height}px`;
        return { top, height };
    };

    return {
        root,
        layout,
        show() {
            root.style.transform = 'translateX(0)';
        },
        hide() {
            root.style.transform = DEFAULT_HIDDEN_TRANSFORM;
        }
    };
};

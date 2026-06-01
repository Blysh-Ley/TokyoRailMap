export const createPanelContentHost = ({
    documentRef = globalThis.document
} = {}) => {
    if (!documentRef?.createElement) {
        throw new Error('createPanelContentHost requires documentRef');
    }

    const panel = documentRef.createElement('div');
    panel.className = 'panel-container';
    panel.style.marginTop = '0';
    panel.style.maxHeight = 'none';
    panel.style.height = '100%';
    panel.style.opacity = '1';
    panel.style.overflow = 'hidden';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    return {
        panel,
        mount(host) {
            if (!host?.appendChild) return false;
            host.appendChild(panel);
            return true;
        }
    };
};

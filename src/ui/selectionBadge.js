const clearChildren = (el) => {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
};

const appendNodes = (host, nodes) => {
    if (!host || !Array.isArray(nodes)) return;
    for (const node of nodes) {
        if (node instanceof Node) host.appendChild(node);
    }
};

export const createSelectionBadge = ({ host = document.body } = {}) => {
    const root = document.createElement('div');
    root.className = 'selection-badge is-hidden';

    const iconEl = document.createElement('span');
    iconEl.className = 'selection-badge-icon';
    iconEl.style.gap = '4px';
    iconEl.style.marginRight = '6px';

    const textEl = document.createElement('span');
    textEl.className = 'selection-badge-text';

    root.appendChild(iconEl);
    root.appendChild(textEl);
    host.appendChild(root);

    const show = ({ text, color, icons = [] } = {}) => {
        clearChildren(iconEl);
        appendNodes(iconEl, icons);
        iconEl.style.display = icons.length ? '' : 'none';
        textEl.textContent = String(text ?? '');
        textEl.style.color = String(color || '');
        root.classList.remove('is-hidden');
    };

    const clear = () => {
        clearChildren(iconEl);
        iconEl.style.display = 'none';
        textEl.textContent = '';
        textEl.style.color = '';
        root.classList.add('is-hidden');
    };

    return {
        clear,
        element: root,
        showCompany: show,
        showLine: show
    };
};

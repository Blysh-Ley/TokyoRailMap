import { createPanelContentHost } from './panelContentHost.js';

const resolveShellRoot = (shellOrRoot) => shellOrRoot?.root || shellOrRoot || null;

export const createPanelContentApi = ({
    createContentHost = createPanelContentHost,
    documentRef = globalThis.document
} = {}) => {
    const contentHost = createContentHost({ documentRef });
    const panel = contentHost.panel;

    return {
        kind: 'panel-content-api',
        panel,
        contentRoot: panel,
        appendContent(node) {
            if (!node || !panel?.appendChild) return false;
            panel.appendChild(node);
            return true;
        },
        mountInto(shellOrRoot) {
            const root = resolveShellRoot(shellOrRoot);
            if (!root) return false;
            return contentHost.mount(root);
        }
    };
};

export const composePanelShellWithContent = ({
    contentApi,
    shell
} = {}) => {
    const root = resolveShellRoot(shell);
    const panel = contentApi?.panel || contentApi?.contentRoot || null;

    return {
        contentApi,
        panel,
        root,
        shell,
        mountContent() {
            if (!contentApi?.mountInto || !root) return false;
            return contentApi.mountInto(root);
        },
        mountShellOverlay(node) {
            if (!node || !root?.appendChild) return false;
            root.appendChild(node);
            return true;
        }
    };
};

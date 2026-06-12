import { createPanelTripDetailTransferHoverPortal } from './panelTripDetailTransferHoverPortal.js';

const DEFAULT_DESKTOP_WIDTH = 280;
const DEFAULT_DESKTOP_HEIGHT = 240;
const DEFAULT_DESKTOP_PADDING = 12;

const clearPlacement = (root) => {
    root.style.left = '';
    root.style.right = '';
    root.style.top = '';
    root.style.bottom = '';
    root.style.width = '';
    root.style.maxWidth = '';
    root.style.maxHeight = '';
};

const placeDesktopTripDetail = ({
    root,
    panelRoot,
    win = globalThis.window,
    clientY = 0
} = {}) => {
    root.style.right = '';
    root.style.bottom = '';
    root.style.width = '';
    root.style.maxWidth = '';
    root.style.maxHeight = '';

    const panelW = root.offsetWidth || DEFAULT_DESKTOP_WIDTH;
    const panelH = root.offsetHeight || DEFAULT_DESKTOP_HEIGHT;
    const pad = DEFAULT_DESKTOP_PADDING;
    const innerWidth = Number(win?.innerWidth) || panelW + pad * 2;
    const innerHeight = Number(win?.innerHeight) || panelH + pad * 2;
    const panelRect = panelRoot?.getBoundingClientRect?.();
    const panelLeft = panelRect?.left ?? (innerWidth - panelW - pad);
    const x = Math.max(pad, Math.min(panelLeft - panelW - pad + 10, innerWidth - panelW - pad + 10));
    const y = Math.max(pad, Math.min((clientY || 0) - 20, innerHeight - panelH - pad));

    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
};

const placeMobileTripDetail = ({ root } = {}) => {
    root.style.left = '0';
    root.style.right = '0';
    root.style.top = 'auto';
    root.style.bottom = '0';
    root.style.width = '100%';
    root.style.maxWidth = 'none';
    root.style.maxHeight = 'min(72vh, calc(100vh - env(safe-area-inset-top, 0px) - 24px))';
};

export const createPanelTripDetailView = ({
    root,
    panelRoot,
    title,
    body,
    win = globalThis.window
} = {}) => {
    if (!root || !title || !body) {
        throw new Error('createPanelTripDetailView requires root, title, and body elements');
    }

    const resolvePresentation = (presentation) => (
        presentation === 'mobile'
            ? 'mobile'
            : (panelRoot?.getAttribute?.('data-panel-presentation') === 'mobile' ? 'mobile' : 'desktop')
    );
    const transferHoverPortal = createPanelTripDetailTransferHoverPortal({
        body,
        root,
        win
    });

    const place = ({ clientY = 0, presentation } = {}) => {
        const activePresentation = resolvePresentation(presentation);
        root.setAttribute('data-panel-trip-detail-presentation', activePresentation);
        if (activePresentation === 'mobile') {
            placeMobileTripDetail({ root });
            return { presentation: activePresentation };
        }
        placeDesktopTripDetail({ root, panelRoot, win, clientY });
        return { presentation: activePresentation };
    };

    const show = ({ clientY = 0, presentation } = {}) => {
        root.classList.remove('is-hidden');
        return place({ clientY, presentation });
    };

    const hide = () => {
        transferHoverPortal.hide();
        root.classList.add('is-hidden');
        clearPlacement(root);
    };

    const setContent = ({
        titleHtml = '',
        bodyHtml = ''
    } = {}) => {
        transferHoverPortal.hide();
        title.innerHTML = titleHtml;
        body.innerHTML = bodyHtml;
    };

    const render = ({
        titleHtml = '',
        bodyHtml = '',
        clientY = 0,
        presentation
    } = {}) => {
        setContent({ titleHtml, bodyHtml });
        return show({ clientY, presentation });
    };

    return {
        body,
        destroy: transferHoverPortal.destroy,
        hide,
        place,
        render,
        root,
        setContent,
        show,
        title
    };
};

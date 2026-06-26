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

const moveToHost = (root, host) => {
    if (!root || !host?.appendChild || root.parentNode === host) return;
    host.appendChild(root);
};

const placeDesktopTripDetail = ({
    root,
    desktopHost,
    panelRoot,
    win = globalThis.window,
    clientY = 0
} = {}) => {
    moveToHost(root, desktopHost);
    root.style.position = 'fixed';
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

const placeMobileTripDetail = ({
    root,
    mobileHost
} = {}) => {
    moveToHost(root, mobileHost);
    root.style.position = 'relative';
    root.style.left = '';
    root.style.right = '';
    root.style.top = '';
    root.style.bottom = '';
    root.style.width = 'auto';
    root.style.maxWidth = 'none';
    root.style.maxHeight = 'none';
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderMobileHeaderMarqueeHtml = ({
    className = '',
    html = '',
    label = ''
} = {}) => {
    const safeLabel = escapeHtml(label);
    const innerHtml = html || safeLabel;
    const safeClassName = className ? ` ${className}` : '';
    return `<span class="panel-dir-title panel-mobile-trip-detail-title-line${safeClassName}"><span class="panel-dir-marquee panel-mobile-trip-detail-title-marquee" aria-label="${safeLabel}"><span class="panel-dir-marquee-inner panel-mobile-trip-detail-title-marquee-inner">${innerHtml}</span></span></span>`;
};

const readCssPx = (value) => {
    const n = Number.parseFloat(String(value ?? '').trim());
    return Number.isFinite(n) ? n : 0;
};

const getVisibleScrollHeight = (body, win = globalThis.window) => {
    const bodyHeight = Math.max(0, Number(body?.clientHeight) || 0);
    if (bodyHeight <= 0) return 0;
    const style = win?.getComputedStyle?.(body);
    const coveredOffset = Math.max(0, readCssPx(style?.getPropertyValue?.('--mobile-sheet-covered-offset')));
    return Math.max(1, bodyHeight - Math.min(bodyHeight - 1, coveredOffset));
};

const scrollCurrentStationIntoView = ({
    behavior = 'auto',
    body,
    setTimeoutFn = globalThis.setTimeout,
    win = globalThis.window
} = {}) => {
    const apply = () => {
        const target = body?.querySelector?.('[data-panel-trip-detail-current-station="1"]');
        if (!target?.getBoundingClientRect || !body?.getBoundingClientRect) return false;

        const bodyRect = body.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const bodyHeight = getVisibleScrollHeight(body, win);
        const targetHeight = Math.max(0, Number(targetRect.height) || 0);
        const naturalTop = (Number(body.scrollTop) || 0) + (Number(targetRect.top) - Number(bodyRect.top));
        const maxTop = Math.max(0, (Number(body.scrollHeight) || 0) - (Number(body.clientHeight) || 0));
        const top = Math.min(
            maxTop,
            Math.max(0, naturalTop - Math.max(0, (bodyHeight / 2) - (targetHeight / 2)))
        );

        try {
            body.scrollTo?.({ top, behavior });
        } catch {
            body.scrollTop = top;
        }
        return true;
    };

    const raf = win?.requestAnimationFrame;
    if (typeof raf === 'function') {
        raf(() => {
            apply();
            setTimeoutFn?.(apply, 80);
        });
        return;
    }
    setTimeoutFn?.(apply, 0);
};

export const createPanelTripDetailView = ({
    desktopHost = globalThis.document?.body,
    mobileActionRow = null,
    mobileCaptureButton = null,
    mobileHost = null,
    mobileTitleMain = null,
    mobileTitleSub = null,
    root,
    panelRoot,
    title,
    body,
    win = globalThis.window
} = {}) => {
    if (!root || !title || !body) {
        throw new Error('createPanelTripDetailView requires root, title, and body elements');
    }

    const defaultMobileActionItems = mobileActionRow?.children
        ? Array.from(mobileActionRow.children)
        : [];
    const defaultCaptureParent = mobileCaptureButton?.parentNode || null;
    let mobileHeaderActive = false;
    let savedMobileTitle = null;

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

    const restoreMobileHeader = () => {
        if (!mobileHeaderActive) return;
        if (mobileTitleMain && savedMobileTitle) {
            mobileTitleMain.innerHTML = savedMobileTitle.mainHtml;
            mobileTitleMain.style.fontSize = savedMobileTitle.mainFontSize;
        }
        if (mobileTitleSub && savedMobileTitle) {
            mobileTitleSub.innerHTML = savedMobileTitle.subHtml;
            mobileTitleSub.hidden = savedMobileTitle.subHidden;
        }
        if (mobileActionRow) {
            mobileActionRow.replaceChildren(...defaultMobileActionItems);
        }
        if (defaultCaptureParent && mobileCaptureButton && mobileCaptureButton.parentNode !== defaultCaptureParent) {
            defaultCaptureParent.appendChild(mobileCaptureButton);
        }
        savedMobileTitle = null;
        mobileHeaderActive = false;
    };

    const applyMobileHeader = ({
        main = '',
        sub = '',
        subHtml = ''
    } = {}) => {
        if (!mobileTitleMain || !mobileTitleSub) return;
        if (!mobileHeaderActive) {
            savedMobileTitle = {
                mainFontSize: mobileTitleMain.style.fontSize || '',
                mainHtml: mobileTitleMain.innerHTML || '',
                subHidden: !!mobileTitleSub.hidden,
                subHtml: mobileTitleSub.innerHTML || ''
            };
            mobileHeaderActive = true;
        }
        mobileTitleMain.innerHTML = renderMobileHeaderMarqueeHtml({
            className: 'is-main',
            label: main
        });
        mobileTitleMain.style.fontSize = '20px';
        mobileTitleSub.innerHTML = sub
            ? renderMobileHeaderMarqueeHtml({
                className: 'is-sub',
                html: subHtml,
                label: sub
            })
            : '';
        mobileTitleSub.hidden = !sub;
        if (mobileActionRow && mobileCaptureButton) {
            mobileActionRow.replaceChildren(mobileCaptureButton);
        }
    };

    const place = ({ clientY = 0, presentation } = {}) => {
        const activePresentation = resolvePresentation(presentation);
        root.setAttribute('data-panel-trip-detail-presentation', activePresentation);
        if (activePresentation === 'mobile') {
            placeMobileTripDetail({ root, mobileHost });
            return { presentation: activePresentation };
        }
        placeDesktopTripDetail({ root, desktopHost, panelRoot, win, clientY });
        return { presentation: activePresentation };
    };

    const show = ({ clientY = 0, presentation } = {}) => {
        root.classList.remove('is-hidden');
        return place({ clientY, presentation });
    };

    const hide = () => {
        transferHoverPortal.hide();
        restoreMobileHeader();
        root.classList.add('is-hidden');
        clearPlacement(root);
    };

    const setContent = ({
        titleHtml = '',
        bodyHtml = '',
        mobileHeader = null,
        presentation
    } = {}) => {
        transferHoverPortal.hide();
        title.innerHTML = titleHtml;
        body.innerHTML = bodyHtml;
        if (resolvePresentation(presentation) === 'mobile') {
            applyMobileHeader({
                main: String(mobileHeader?.main ?? ''),
                sub: String(mobileHeader?.sub ?? ''),
                subHtml: String(mobileHeader?.subHtml ?? '')
            });
        } else {
            restoreMobileHeader();
        }
    };

    const render = ({
        titleHtml = '',
        bodyHtml = '',
        clientY = 0,
        mobileHeader = null,
        presentation,
        scrollToCurrentStation = false
    } = {}) => {
        setContent({ titleHtml, bodyHtml, mobileHeader, presentation });
        const placement = show({ clientY, presentation });
        if (scrollToCurrentStation) {
            scrollCurrentStationIntoView({ body, win });
        }
        return placement;
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

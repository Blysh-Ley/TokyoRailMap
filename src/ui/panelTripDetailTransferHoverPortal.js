const toText = (value) => String(value ?? '').trim();

const isElement = (value, win = globalThis.window) => {
    const ElementCtor = win?.HTMLElement;
    return typeof ElementCtor === 'function' && value instanceof ElementCtor;
};

export const createPanelTripDetailTransferHoverPortal = ({
    body,
    doc = globalThis.document,
    root,
    win = globalThis.window
} = {}) => {
    if (!root || !body || !doc?.body) {
        return {
            destroy: () => {},
            hide: () => {}
        };
    }

    const portal = doc.createElement('div');
    portal.className = 'panel-trip-detail-transfer-hover-portal is-hidden';
    portal.setAttribute('role', 'tooltip');
    doc.body.appendChild(portal);

    let activeShell = null;

    const hide = () => {
        activeShell = null;
        portal.classList.add('is-hidden');
        portal.innerHTML = '';
        portal.style.left = '';
        portal.style.top = '';
        portal.style.visibility = '';
    };

    const position = (shell) => {
        if (!isElement(shell, win) || portal.classList.contains('is-hidden')) return;

        const pad = 6;
        const gap = 8;
        const rawViewportWidth = Number(win?.innerWidth) || 0;
        const maxPortalWidth = rawViewportWidth > pad * 2 ? rawViewportWidth - pad * 2 : 280;
        portal.style.maxWidth = `${maxPortalWidth}px`;

        const shellRect = shell.getBoundingClientRect();
        const portalRect = portal.getBoundingClientRect();
        const viewportWidth = rawViewportWidth || portalRect.width + pad * 2;
        const viewportHeight = Number(win?.innerHeight) || portalRect.height + pad * 2;

        let left = shellRect.left - portalRect.width - gap;
        if (!Number.isFinite(left) || left < pad) {
            left = shellRect.right + gap;
        }
        left = Math.max(pad, Math.min(left, Math.max(pad, viewportWidth - portalRect.width - pad)));

        let top = shellRect.top + shellRect.height / 2 - portalRect.height / 2;
        if (!Number.isFinite(top)) top = pad;
        top = Math.max(pad, Math.min(top, Math.max(pad, viewportHeight - portalRect.height - pad)));

        portal.style.left = `${left}px`;
        portal.style.top = `${top}px`;
    };

    const show = (shell) => {
        if (!isElement(shell, win)) return;
        const template = shell.querySelector('.panel-trip-detail-transfer-hover-panel');
        const html = toText(template?.innerHTML);
        if (!html) {
            hide();
            return;
        }

        activeShell = shell;
        portal.innerHTML = html;
        portal.classList.remove('is-hidden');
        portal.style.visibility = 'hidden';
        position(shell);
        portal.style.visibility = '';
    };

    const onPointerOver = (evt) => {
        const shell = evt?.target?.closest?.('.panel-trip-detail-transfer-shell');
        if (!isElement(shell, win) || !body.contains(shell)) return;
        if (shell === activeShell) {
            position(shell);
            return;
        }
        show(shell);
    };

    const onPointerOut = (evt) => {
        const shell = evt?.target?.closest?.('.panel-trip-detail-transfer-shell');
        if (!isElement(shell, win) || shell !== activeShell) return;
        const related = evt.relatedTarget;
        const NodeCtor = win?.Node;
        if (typeof NodeCtor === 'function' && related instanceof NodeCtor && shell.contains(related)) return;
        hide();
    };

    const onFocusIn = (evt) => {
        const shell = evt?.target?.closest?.('.panel-trip-detail-transfer-shell');
        if (!isElement(shell, win) || !body.contains(shell)) return;
        show(shell);
    };

    const onFocusOut = (evt) => {
        const shell = evt?.target?.closest?.('.panel-trip-detail-transfer-shell');
        if (!isElement(shell, win) || shell !== activeShell) return;
        const related = evt.relatedTarget;
        const NodeCtor = win?.Node;
        if (typeof NodeCtor === 'function' && related instanceof NodeCtor && shell.contains(related)) return;
        hide();
    };

    const onScroll = () => {
        if (activeShell) position(activeShell);
    };

    const onResize = () => {
        if (activeShell) position(activeShell);
    };

    body.addEventListener('pointerover', onPointerOver);
    body.addEventListener('pointerout', onPointerOut);
    body.addEventListener('focusin', onFocusIn);
    body.addEventListener('focusout', onFocusOut);
    body.addEventListener('scroll', onScroll, { passive: true });
    win?.addEventListener?.('resize', onResize, { passive: true });

    return {
        destroy: () => {
            hide();
            body.removeEventListener('pointerover', onPointerOver);
            body.removeEventListener('pointerout', onPointerOut);
            body.removeEventListener('focusin', onFocusIn);
            body.removeEventListener('focusout', onFocusOut);
            body.removeEventListener('scroll', onScroll);
            win?.removeEventListener?.('resize', onResize);
            portal.remove();
        },
        hide
    };
};

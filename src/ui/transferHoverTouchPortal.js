import {
    createTouchTapIntentTracker,
    isTouchLikePointer,
    readPointerType
} from './touchTapIntent.js';

const noop = () => {};

const stopPropagationOnly = (evt) => {
    try {
        evt?.stopPropagation?.();
    } catch {
        // ignore synthetic/test events without full Event API
    }
};

const isElementLike = (value) => !!value && typeof value.closest === 'function';

export const createTransferHoverTouchPortalController = ({
    doc = globalThis.document,
    findShell = () => null,
    hide = noop,
    isMobile = () => false,
    maxDurationMs = 500,
    maxMovePx = 12,
    portal,
    root,
    show = noop
} = {}) => {
    if (!doc?.addEventListener || !portal) {
        return {
            destroy: noop,
            isMobileInteraction: () => false
        };
    }

    const tapTracker = createTouchTapIntentTracker({ maxDurationMs, maxMovePx });

    const isMobileInteraction = (evt = null) => {
        if (isMobile?.() !== true) return false;
        if (!evt) return true;
        return isTouchLikePointer(readPointerType(evt));
    };

    const isVisible = () => !portal.classList?.contains?.('is-hidden');

    const containsPortalTarget = (target) => {
        if (!target || typeof portal.contains !== 'function') return false;
        return portal.contains(target);
    };

    const resolveShell = (target) => {
        if (!isElementLike(target)) return null;
        const shell = findShell(target);
        if (!shell) return null;
        if (root?.contains && !root.contains(shell)) return null;
        return shell;
    };

    const onPointerDown = (evt) => {
        if (!isMobileInteraction(evt)) return;

        if (isVisible()) {
            tapTracker.cancel();
            if (containsPortalTarget(evt?.target)) {
                stopPropagationOnly(evt);
                return;
            }
            hide();
            return;
        }

        const shell = resolveShell(evt?.target);
        if (!shell) {
            tapTracker.cancel();
            return;
        }

        tapTracker.begin(evt, { shell });
        stopPropagationOnly(evt);
    };

    const onPointerMove = (evt) => {
        if (!isMobileInteraction(evt)) return;
        tapTracker.move(evt);
    };

    const onPointerUp = (evt) => {
        if (!isMobileInteraction(evt)) return;
        const completed = tapTracker.finish(evt);
        if (!completed.handled) return;
        if (completed.eligible !== true) return;
        const shell = completed.tap?.shell;
        if (!shell || (root?.contains && !root.contains(shell))) return;
        show(shell);
        stopPropagationOnly(evt);
    };

    const onPointerCancel = (evt) => {
        if (!isMobileInteraction(evt)) return;
        tapTracker.cancel();
    };

    const onClick = (evt) => {
        if (isMobile?.() !== true) return;
        if (!isVisible()) return;
        if (!containsPortalTarget(evt?.target)) return;
        stopPropagationOnly(evt);
    };

    doc.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    doc.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    doc.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
    doc.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: true });
    doc.addEventListener('click', onClick, { capture: true, passive: true });

    return {
        destroy: () => {
            tapTracker.cancel();
            doc.removeEventListener?.('pointerdown', onPointerDown, { capture: true });
            doc.removeEventListener?.('pointermove', onPointerMove, { capture: true });
            doc.removeEventListener?.('pointerup', onPointerUp, { capture: true });
            doc.removeEventListener?.('pointercancel', onPointerCancel, { capture: true });
            doc.removeEventListener?.('click', onClick, { capture: true });
        },
        isMobileInteraction
    };
};

import {
    DEFAULT_MOBILE_SHEET_PEEK_PX,
    createMobileSheetDragSession,
    getMobileSheetOffsetForState,
    normalizeMobileSheetState,
    resolveMobileSheetDragTarget,
    updateMobileSheetDragSession
} from './mobileSheetSnap.js';
import { createMobileSheetPullDownController } from './mobileSheetPullDown.js';

const getFallbackHeight = (win) => {
    const height = Number(win?.innerHeight) || 0;
    return Math.max(1, Math.round(Math.min(height * 0.58, 560) || 1));
};

const DEFAULT_HALF_VISIBLE_RATIO = 0.54375;

export const createMobileJourneyPlanSheet = ({
    rootEl,
    win = globalThis.window,
    isEnabled = () => false,
    isVisible = () => true,
    peekPx = DEFAULT_MOBILE_SHEET_PEEK_PX,
    halfVisibleRatio = DEFAULT_HALF_VISIBLE_RATIO
} = {}) => {
    let state = 'expanded';
    let dragSession = null;

    const getSheetHeightElement = () => (
        rootEl?.querySelector?.('.journey-plan-drawer')
        || rootEl?.querySelector?.('.journey-plan-item')
        || rootEl
    );

    const getTransformElement = () => (
        rootEl?.querySelector?.('.journey-plan-drawer')
        || rootEl?.querySelector?.('.journey-plan-item')
        || null
    );

    const clearRootTransform = () => {
        if (rootEl?.style) rootEl.style.transform = '';
    };

    const getHeight = () => {
        const rect = getSheetHeightElement()?.getBoundingClientRect?.();
        return Math.max(1, Math.round(Number(rect?.height) || getFallbackHeight(win)));
    };

    const getHalfOffset = (height) => {
        const visibleRatio = Number(halfVisibleRatio);
        const ratio = Number.isFinite(visibleRatio) && visibleRatio > 0 && visibleRatio < 1
            ? visibleRatio
            : DEFAULT_HALF_VISIBLE_RATIO;
        return Math.round(height * (1 - ratio));
    };

    const getSnapOptions = () => {
        const height = getHeight();
        return { height, peekPx, halfOffsetPx: getHalfOffset(height) };
    };

    const getOffsetForState = (nextState) => (
        getMobileSheetOffsetForState(normalizeMobileSheetState(nextState), getSnapOptions())
    );

    const applyState = (nextState, { transition = true } = {}) => {
        state = normalizeMobileSheetState(nextState);
        if (rootEl?.dataset) rootEl.dataset.journeyPlanSheetState = state;
        clearRootTransform();
        const transformEl = getTransformElement();
        if (transformEl?.style) transformEl.style.transition = transition ? '' : 'none';

        if (!isEnabled() || !isVisible()) {
            if (transformEl?.style) transformEl.style.transform = '';
            return state;
        }

        if (transformEl?.style) transformEl.style.transform = `translateY(${getOffsetForState(state)}px)`;
        return state;
    };

    const beginDrag = (event, { captureEl = null } = {}) => {
        if (!isEnabled() || !isVisible()) return false;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        dragSession = createMobileSheetDragSession({
            startY: Number(event?.clientY) || 0,
            startOffset: getOffsetForState(state),
            startState: state,
            ...getSnapOptions()
        });
        if (rootEl?.dataset) rootEl.dataset.journeyPlanSheetDragging = '1';
        const transformEl = getTransformElement();
        if (transformEl?.style) transformEl.style.transition = 'none';
        try {
            if (event?.pointerId != null) captureEl?.setPointerCapture?.(event.pointerId);
        } catch {
            // ignore unsupported pointer capture
        }
        return true;
    };

    const updateDrag = (event) => {
        if (!dragSession) return false;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const session = updateMobileSheetDragSession(dragSession, {
            clientY: Number(event?.clientY) || dragSession.currentY
        });
        const transformEl = getTransformElement();
        if (session && transformEl?.style) {
            transformEl.style.transform = `translateY(${session.currentOffset}px)`;
        }
        return true;
    };

    const finishDrag = (event, { cancelled = false } = {}) => {
        if (!dragSession) return state;

        event?.preventDefault?.();
        event?.stopPropagation?.();
        const targetState = resolveMobileSheetDragTarget(dragSession, {
            clientY: Number(event?.clientY) || dragSession.currentY,
            cancelled
        });
        dragSession = null;
        if (rootEl?.dataset) delete rootEl.dataset.journeyPlanSheetDragging;
        try {
            if (event?.pointerId != null) event?.currentTarget?.releasePointerCapture?.(event.pointerId);
        } catch {
            // ignore optional pointer capture cleanup failures
        }
        return applyState(targetState, { transition: true });
    };

    const bindHandle = (handleEl) => {
        if (!handleEl?.addEventListener) return null;

        const beginHandleDrag = (event) => beginDrag(event, { captureEl: handleEl });
        const endDrag = (event) => finishDrag(event);
        const cancelDrag = (event) => finishDrag(event, { cancelled: true });

        handleEl.addEventListener('pointerdown', beginHandleDrag);
        handleEl.addEventListener('pointermove', updateDrag);
        handleEl.addEventListener('pointerup', endDrag);
        handleEl.addEventListener('pointercancel', cancelDrag);
        handleEl.addEventListener('lostpointercapture', cancelDrag);

        return () => {
            handleEl.removeEventListener('pointerdown', beginHandleDrag);
            handleEl.removeEventListener('pointermove', updateDrag);
            handleEl.removeEventListener('pointerup', endDrag);
            handleEl.removeEventListener('pointercancel', cancelDrag);
            handleEl.removeEventListener('lostpointercapture', cancelDrag);
        };
    };

    const bindScrollableContent = (scrollEl) => createMobileSheetPullDownController({
        scrollEl,
        doc: rootEl?.ownerDocument || win?.document || globalThis.document,
        isEnabled: () => isEnabled() && isVisible(),
        beginSheetDrag: (event) => beginDrag(event),
        updateSheetDrag: updateDrag,
        endSheetDrag: finishDrag
    });

    win?.addEventListener?.('resize', () => {
        if (isVisible()) applyState(state, { transition: false });
    });

    return {
        bindHandle,
        bindScrollableContent,
        getState: () => state,
        hide() {
            if (rootEl?.dataset) rootEl.dataset.journeyPlanSheetState = 'hidden';
            clearRootTransform();
            const transformEl = getTransformElement();
            if (transformEl?.style) transformEl.style.transform = '';
            dragSession = null;
        },
        show({ nextState = 'expanded' } = {}) {
            const run = () => applyState(nextState, { transition: true });
            if (typeof win?.requestAnimationFrame === 'function') win.requestAnimationFrame(run);
            else run();
        }
    };
};

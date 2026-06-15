const DEFAULT_TOP_EPSILON_PX = 1;
const DEFAULT_START_THRESHOLD_PX = 8;
const DEFAULT_HORIZONTAL_SLOP_RATIO = 1.25;

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const isPrimaryPointer = (evt) => !(evt?.button != null && evt.button !== 0);

const stopEvent = (evt) => {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
};

const getScrollTop = (el) => Math.max(0, toNumber(el?.scrollTop, 0));

export const createMobileSheetPullDownController = ({
    scrollEl,
    doc = globalThis.document,
    topEpsilonPx = DEFAULT_TOP_EPSILON_PX,
    startThresholdPx = DEFAULT_START_THRESHOLD_PX,
    horizontalSlopRatio = DEFAULT_HORIZONTAL_SLOP_RATIO,
    isEnabled = () => true,
    beginSheetDrag = () => false,
    updateSheetDrag = () => {},
    endSheetDrag = () => {}
} = {}) => {
    if (!scrollEl?.addEventListener) {
        return { destroy() {} };
    }

    let gesture = null;

    const clearGesture = () => {
        gesture = null;
    };

    const canStartAtTop = () => (
        isEnabled?.() === true
        && getScrollTop(scrollEl) <= topEpsilonPx
    );

    const onPointerDown = (evt) => {
        if (!isPrimaryPointer(evt)) {
            clearGesture();
            return;
        }
        if (!canStartAtTop()) {
            clearGesture();
            return;
        }
        gesture = {
            pointerId: evt?.pointerId,
            startX: toNumber(evt?.clientX, 0),
            startY: toNumber(evt?.clientY, 0),
            dragging: false
        };
    };

    const pointerMatches = (evt) => (
        gesture
        && !(gesture.pointerId != null && evt?.pointerId !== gesture.pointerId)
    );

    const onPointerMove = (evt) => {
        if (!pointerMatches(evt)) return;

        const x = toNumber(evt?.clientX, gesture.startX);
        const y = toNumber(evt?.clientY, gesture.startY);
        const dx = x - gesture.startX;
        const dy = y - gesture.startY;

        if (!gesture.dragging) {
            if (dy < -startThresholdPx) {
                clearGesture();
                return;
            }
            if (Math.abs(dx) > Math.max(startThresholdPx, Math.abs(dy) * horizontalSlopRatio)) {
                clearGesture();
                return;
            }
            if (dy <= startThresholdPx) return;
            if (getScrollTop(scrollEl) > topEpsilonPx) {
                clearGesture();
                return;
            }
            if (beginSheetDrag(evt) !== true) {
                clearGesture();
                return;
            }
            gesture.dragging = true;
        }

        updateSheetDrag(evt);
        stopEvent(evt);
    };

    const finish = (evt, { cancelled = false } = {}) => {
        if (!pointerMatches(evt)) return;
        const wasDragging = gesture.dragging;
        clearGesture();
        if (!wasDragging) return;
        endSheetDrag(evt, { cancelled });
        stopEvent(evt);
    };
    const finishPointerUp = (evt) => finish(evt);
    const finishCancelled = (evt) => finish(evt, { cancelled: true });

    scrollEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    scrollEl.addEventListener('pointermove', onPointerMove, { passive: false });
    doc?.addEventListener?.('pointermove', onPointerMove, { capture: true, passive: false });
    scrollEl.addEventListener('pointerup', finishPointerUp, { passive: false });
    doc?.addEventListener?.('pointerup', finishPointerUp, { capture: true, passive: false });
    scrollEl.addEventListener('pointercancel', finishCancelled, { passive: false });
    doc?.addEventListener?.('pointercancel', finishCancelled, { capture: true, passive: false });
    scrollEl.addEventListener('lostpointercapture', finishCancelled, { passive: false });

    return {
        destroy() {
            scrollEl.removeEventListener?.('pointerdown', onPointerDown);
            scrollEl.removeEventListener?.('pointermove', onPointerMove);
            doc?.removeEventListener?.('pointermove', onPointerMove, { capture: true });
            scrollEl.removeEventListener?.('pointerup', finishPointerUp);
            doc?.removeEventListener?.('pointerup', finishPointerUp, { capture: true });
            scrollEl.removeEventListener?.('pointercancel', finishCancelled);
            doc?.removeEventListener?.('pointercancel', finishCancelled, { capture: true });
            scrollEl.removeEventListener?.('lostpointercapture', finishCancelled);
            clearGesture();
        }
    };
};

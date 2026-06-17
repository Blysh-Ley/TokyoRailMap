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

const getFirstTouch = (touches) => Array.from(touches || [])[0] || null;

const getTouchById = (touches, identifier) => {
    for (const touch of Array.from(touches || [])) {
        if (touch?.identifier === identifier) return touch;
    }
    return null;
};

const createTouchLikeEvent = (evt, touch, fallback = {}) => ({
    pointerId: touch?.identifier ?? fallback.pointerId,
    clientX: toNumber(touch?.clientX, fallback.clientX),
    clientY: toNumber(touch?.clientY, fallback.clientY),
    timeStamp: evt?.timeStamp,
    preventDefault: () => evt?.preventDefault?.(),
    stopPropagation: () => evt?.stopPropagation?.()
});

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
            dragging: false,
            mode: 'pointer'
        };
    };

    const pointerMatches = (evt) => (
        gesture
        && gesture.mode !== 'touch'
        && !(gesture.pointerId != null && evt?.pointerId !== gesture.pointerId)
    );

    const updateGesture = (evt, {
        clientX = gesture?.startX,
        clientY = gesture?.startY,
        createStartEvent = () => evt,
        createMoveEvent = () => evt
    } = {}) => {
        if (!gesture) return;
        const x = toNumber(clientX, gesture.startX);
        const y = toNumber(clientY, gesture.startY);
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
            if (beginSheetDrag(createStartEvent()) !== true) {
                clearGesture();
                return;
            }
            gesture.dragging = true;
        }

        updateSheetDrag(createMoveEvent());
        stopEvent(evt);
    };

    const onPointerMove = (evt) => {
        if (!pointerMatches(evt)) return;
        updateGesture(evt, {
            clientX: evt?.clientX,
            clientY: evt?.clientY
        });
    };

    const onTouchStart = (evt) => {
        const touch = getFirstTouch(evt?.touches);
        if (!touch || (evt?.touches?.length || 0) > 1) {
            clearGesture();
            return;
        }
        if (!canStartAtTop()) {
            clearGesture();
            return;
        }
        gesture = {
            pointerId: touch.identifier,
            startX: toNumber(touch.clientX, 0),
            startY: toNumber(touch.clientY, 0),
            dragging: false,
            mode: 'touch'
        };
    };

    const onTouchMove = (evt) => {
        if (!gesture || gesture.mode !== 'touch') return;
        const touch = getTouchById(evt?.touches, gesture.pointerId);
        if (!touch) return;
        const dy = toNumber(touch.clientY, gesture.startY) - gesture.startY;
        if (!gesture.dragging && dy > 0 && getScrollTop(scrollEl) <= topEpsilonPx) {
            stopEvent(evt);
        }
        updateGesture(evt, {
            clientX: touch.clientX,
            clientY: touch.clientY,
            createStartEvent: () => createTouchLikeEvent(evt, {
                identifier: gesture.pointerId,
                clientX: gesture.startX,
                clientY: gesture.startY
            }),
            createMoveEvent: () => createTouchLikeEvent(evt, touch, {
                pointerId: gesture.pointerId,
                clientX: gesture.startX,
                clientY: gesture.startY
            })
        });
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
    const finishTouch = (evt, { cancelled = false } = {}) => {
        if (!gesture || gesture.mode !== 'touch') return;
        const touch = getTouchById(evt?.changedTouches, gesture.pointerId) || {
            identifier: gesture.pointerId,
            clientX: gesture.startX,
            clientY: gesture.startY
        };
        const endEvent = createTouchLikeEvent(evt, touch, {
            pointerId: gesture.pointerId,
            clientX: gesture.startX,
            clientY: gesture.startY
        });
        const wasDragging = gesture.dragging;
        clearGesture();
        if (!wasDragging) return;
        endSheetDrag(endEvent, { cancelled });
        stopEvent(evt);
    };
    const finishTouchEnd = (evt) => finishTouch(evt);
    const finishTouchCancelled = (evt) => finishTouch(evt, { cancelled: true });

    scrollEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    scrollEl.addEventListener('pointermove', onPointerMove, { passive: false });
    doc?.addEventListener?.('pointermove', onPointerMove, { capture: true, passive: false });
    scrollEl.addEventListener('pointerup', finishPointerUp, { passive: false });
    doc?.addEventListener?.('pointerup', finishPointerUp, { capture: true, passive: false });
    scrollEl.addEventListener('pointercancel', finishCancelled, { passive: false });
    doc?.addEventListener?.('pointercancel', finishCancelled, { capture: true, passive: false });
    scrollEl.addEventListener('lostpointercapture', finishCancelled, { passive: false });
    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true });
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: false });
    doc?.addEventListener?.('touchmove', onTouchMove, { capture: true, passive: false });
    scrollEl.addEventListener('touchend', finishTouchEnd, { passive: false });
    doc?.addEventListener?.('touchend', finishTouchEnd, { capture: true, passive: false });
    scrollEl.addEventListener('touchcancel', finishTouchCancelled, { passive: false });
    doc?.addEventListener?.('touchcancel', finishTouchCancelled, { capture: true, passive: false });

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
            scrollEl.removeEventListener?.('touchstart', onTouchStart);
            scrollEl.removeEventListener?.('touchmove', onTouchMove);
            doc?.removeEventListener?.('touchmove', onTouchMove, { capture: true });
            scrollEl.removeEventListener?.('touchend', finishTouchEnd);
            doc?.removeEventListener?.('touchend', finishTouchEnd, { capture: true });
            scrollEl.removeEventListener?.('touchcancel', finishTouchCancelled);
            doc?.removeEventListener?.('touchcancel', finishTouchCancelled, { capture: true });
            clearGesture();
        }
    };
};

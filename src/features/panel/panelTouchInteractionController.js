export const readPointerType = (evt) => {
    const pt = evt?.pointerType;
    if (pt) return String(pt);
    const t = evt?.type;
    if (t && String(t).startsWith('touch')) return 'touch';
    return 'mouse';
};

export const isTouchLikePointer = (pt) => pt === 'touch' || pt === 'pen';

export const createPanelTouchInteractionController = ({
    cancelClickSuppressMs = 260,
    cancelHoverSuppressMs = 1000,
    maxMovePx = 12,
    mouseSuppressMs = 800,
    now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())
} = {}) => {
    const maxMoveSq = maxMovePx * maxMovePx;
    let lastPointerType = 'mouse';
    let pendingTripTap = null;
    let suppressMouseClickUntilMs = 0;
    let suppressMouseEventsUntilMs = 0;
    let suppressMouseHoverUntilMs = 0;

    const markPointer = (evt) => {
        lastPointerType = readPointerType(evt);
        return lastPointerType;
    };

    const pointerMatchesPending = (evt, pending) => {
        const pendingPointerId = pending?.pointerId;
        const evtPointerId = evt?.pointerId;
        return !(pendingPointerId != null && evtPointerId != null && pendingPointerId !== evtPointerId);
    };

    const beginPointer = (evt) => {
        const pointerType = markPointer(evt);
        const isTouchLike = isTouchLikePointer(pointerType);
        if (isTouchLike) {
            suppressMouseEventsUntilMs = now() + mouseSuppressMs;
            pendingTripTap = null;
        }
        return { isTouchLike, pointerType };
    };

    const startTripTap = (evt, payload = {}) => {
        pendingTripTap = {
            pointerId: evt?.pointerId,
            startX: evt?.clientX ?? 0,
            startY: evt?.clientY ?? 0,
            moved: false,
            ...payload
        };
        return pendingTripTap;
    };

    const moveTripTap = (evt) => {
        if (!pendingTripTap) return { handled: false };
        const pointerType = readPointerType(evt);
        if (!isTouchLikePointer(pointerType)) return { handled: false, pointerType };
        if (!pointerMatchesPending(evt, pendingTripTap)) return { handled: false, pointerMismatch: true, pointerType };

        const dx = (evt?.clientX ?? pendingTripTap.startX) - pendingTripTap.startX;
        const dy = (evt?.clientY ?? pendingTripTap.startY) - pendingTripTap.startY;
        if ((dx * dx + dy * dy) > maxMoveSq) {
            pendingTripTap.moved = true;
        }
        return { handled: true, pointerType, tap: pendingTripTap };
    };

    const finishTripTap = (evt) => {
        const pending = pendingTripTap;
        if (!pending) return { handled: false };

        const pointerType = markPointer(evt);
        if (!isTouchLikePointer(pointerType)) {
            pendingTripTap = null;
            return { handled: false, pointerType };
        }

        if (!pointerMatchesPending(evt, pending)) {
            return { handled: false, pointerMismatch: true, pointerType };
        }

        pendingTripTap = null;
        const dx = (evt?.clientX ?? pending.startX) - pending.startX;
        const dy = (evt?.clientY ?? pending.startY) - pending.startY;
        const moved = pending.moved || (dx * dx + dy * dy) > maxMoveSq;

        return {
            clientX: evt?.clientX || pending.startX,
            clientY: evt?.clientY || pending.startY,
            handled: true,
            moved,
            pointerType,
            tap: pending
        };
    };

    const armCancelInteractionSuppression = () => {
        const base = now();
        suppressMouseClickUntilMs = base + cancelClickSuppressMs;
        suppressMouseHoverUntilMs = base + cancelHoverSuppressMs;
    };

    return {
        armCancelInteractionSuppression,
        beginPointer,
        cancelTripTap() {
            pendingTripTap = null;
        },
        finishTripTap,
        getLastPointerType: () => lastPointerType,
        hasPendingTripTap: () => !!pendingTripTap,
        isLastPointerTouchLike: () => isTouchLikePointer(lastPointerType),
        isTouchLikePointer,
        markPointer,
        moveTripTap,
        readPointerType,
        shouldSuppressMouseClick: () => now() < suppressMouseClickUntilMs,
        shouldSuppressMouseEvents: () => now() < suppressMouseEventsUntilMs,
        shouldSuppressMouseHover: () => now() < suppressMouseHoverUntilMs,
        startTripTap
    };
};

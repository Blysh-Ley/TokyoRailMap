const defaultNow = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

export const readPointerType = (evt) => {
    const pt = evt?.pointerType;
    if (pt) return String(pt);
    const type = evt?.type;
    if (type && String(type).startsWith('touch')) return 'touch';
    return 'mouse';
};

export const isTouchLikePointer = (pointerType) => {
    const text = String(pointerType || '');
    return text === 'touch' || text === 'pen';
};

export const createTouchTapIntentTracker = ({
    maxDurationMs = 500,
    maxMovePx = 12,
    now = defaultNow
} = {}) => {
    const maxMoveSq = maxMovePx * maxMovePx;
    let pending = null;

    const pointerMatchesPending = (evt) => {
        if (!pending) return false;
        const pendingPointerId = pending.pointerId;
        const evtPointerId = evt?.pointerId;
        return !(pendingPointerId != null && evtPointerId != null && pendingPointerId !== evtPointerId);
    };

    const begin = (evt, payload = {}) => {
        const pointerType = readPointerType(evt);
        if (!isTouchLikePointer(pointerType)) {
            pending = null;
            return { handled: false, pointerType };
        }

        pending = {
            pointerId: evt?.pointerId,
            startX: toNumber(evt?.clientX, 0),
            startY: toNumber(evt?.clientY, 0),
            startAt: now(),
            moved: false,
            multiTouch: false,
            payload
        };

        return { handled: true, pointerType, payload, tap: payload };
    };

    const markMultiTouch = () => {
        if (pending) pending.multiTouch = true;
    };

    const move = (evt) => {
        if (!pending) return { handled: false };
        const pointerType = readPointerType(evt);
        if (!isTouchLikePointer(pointerType)) return { handled: false, pointerType };
        if (!pointerMatchesPending(evt)) return { handled: false, pointerMismatch: true, pointerType };

        const dx = toNumber(evt?.clientX, pending.startX) - pending.startX;
        const dy = toNumber(evt?.clientY, pending.startY) - pending.startY;
        if ((dx * dx + dy * dy) > maxMoveSq) pending.moved = true;
        return { handled: true, pointerType, payload: pending.payload, tap: pending.payload };
    };

    const finish = (evt) => {
        if (!pending) return { handled: false };
        const current = pending;
        const pointerType = readPointerType(evt);

        if (!isTouchLikePointer(pointerType)) {
            pending = null;
            return { handled: false, pointerType };
        }

        if (!pointerMatchesPending(evt)) {
            return { handled: false, pointerMismatch: true, pointerType };
        }

        pending = null;
        const clientX = toNumber(evt?.clientX, current.startX);
        const clientY = toNumber(evt?.clientY, current.startY);
        const dx = clientX - current.startX;
        const dy = clientY - current.startY;
        const moved = current.moved || (dx * dx + dy * dy) > maxMoveSq;
        const expired = now() - current.startAt > maxDurationMs;
        const eligible = !current.multiTouch && !moved && !expired;

        return {
            clientX,
            clientY,
            eligible,
            expired,
            handled: true,
            moved,
            multiTouch: current.multiTouch,
            payload: current.payload,
            pointerType,
            tap: current.payload
        };
    };

    const cancel = () => {
        const hadPending = !!pending;
        pending = null;
        return { handled: hadPending };
    };

    return {
        begin,
        cancel,
        finish,
        hasPending: () => !!pending,
        markMultiTouch,
        move
    };
};

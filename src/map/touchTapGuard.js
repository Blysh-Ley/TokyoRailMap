/**
 * 触屏防误触：只有“短按且几乎不移动”的手势才视为 tap。
 * 用于避免拖动地图/双指缩放时误触发 click（弹 popup / 高亮）。
 */

let globalGuard = null;

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const isTouchLikePointerType = (pt) => {
    const s = String(pt || '');
    return s === 'touch' || s === 'pen';
};

function createGuard({
    maxDurationMs = 500,
    maxMovePx = 12,
    clickWindowMs = 800,
    recentTouchMs = 1200
} = {}) {
    const activePointers = new Map(); // pointerId -> { x, y }

    let gestureStartAt = 0;
    let gesturePointerType = 'mouse';
    let gestureMaxMoveSq = 0;
    let gestureMultiTouch = false;

    let lastTouchLikeDownAt = 0;

    const lastGesture = {
        endedAt: 0,
        eligible: false,
        pointerType: 'mouse'
    };

    const resetGestureIfIdle = () => {
        if (activePointers.size) return;
        gestureStartAt = 0;
        gesturePointerType = 'mouse';
        gestureMaxMoveSq = 0;
        gestureMultiTouch = false;
    };

    const onPointerDown = (evt) => {
        const pt = evt?.pointerType;
        if (!isTouchLikePointerType(pt)) return;

        lastTouchLikeDownAt = nowMs();

        const id = evt.pointerId;
        if (id == null) return;

        // 新一轮手势
        if (activePointers.size === 0) {
            gestureStartAt = nowMs();
            gesturePointerType = String(pt);
            gestureMaxMoveSq = 0;
            gestureMultiTouch = false;
        }

        activePointers.set(id, { x: evt.clientX ?? 0, y: evt.clientY ?? 0 });
        if (activePointers.size >= 2) gestureMultiTouch = true;
    };

    const onPointerMove = (evt) => {
        const id = evt?.pointerId;
        if (id == null) return;
        if (!activePointers.has(id)) return;

        const start = activePointers.get(id);
        const dx = (evt.clientX ?? 0) - (start?.x ?? 0);
        const dy = (evt.clientY ?? 0) - (start?.y ?? 0);
        const d2 = dx * dx + dy * dy;
        if (d2 > gestureMaxMoveSq) gestureMaxMoveSq = d2;
    };

    const finishIfLastPointerUp = (pt) => {
        if (activePointers.size) return;

        const endAt = nowMs();
        const duration = gestureStartAt ? endAt - gestureStartAt : Number.POSITIVE_INFINITY;
        const maxMove = Math.sqrt(Math.max(0, gestureMaxMoveSq));

        lastGesture.endedAt = endAt;
        lastGesture.pointerType = String(pt || gesturePointerType || 'touch');
        lastGesture.eligible = !gestureMultiTouch && duration <= maxDurationMs && maxMove <= maxMovePx;

        resetGestureIfIdle();
    };

    const onPointerUp = (evt) => {
        const pt = evt?.pointerType;
        if (!isTouchLikePointerType(pt)) return;

        const id = evt.pointerId;
        if (id != null) activePointers.delete(id);
        finishIfLastPointerUp(pt);
    };

    const onPointerCancel = (evt) => {
        const pt = evt?.pointerType;
        if (!isTouchLikePointerType(pt)) return;

        const id = evt.pointerId;
        if (id != null) activePointers.delete(id);
        // cancel 一律视为不合格 tap
        if (!activePointers.size) {
            lastGesture.endedAt = nowMs();
            lastGesture.pointerType = String(pt || gesturePointerType || 'touch');
            lastGesture.eligible = false;
            resetGestureIfIdle();
        }
    };

    const isLikelyTouchDerivedEvent = (evt) => {
        const pt = evt?.pointerType;
        if (isTouchLikePointerType(pt)) return true;
        // 合成的 MouseEvent/click：用“最近是否有 touchlike pointerdown”兜底
        return nowMs() - (lastTouchLikeDownAt || 0) <= recentTouchMs;
    };

    const allowTap = (evt) => {
        // 非触屏（鼠标）不拦截
        if (!isLikelyTouchDerivedEvent(evt)) return true;

        const t = nowMs();
        if (!lastGesture.eligible) return false;
        if (t - (lastGesture.endedAt || 0) > clickWindowMs) return false;
        return true;
    };

    const bind = (target) => {
        if (!target || !target.addEventListener) return;
        // capture：确保即便后续 stopPropagation 也能记录手势
        target.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
        target.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
        target.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
        target.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: true });
    };

    return {
        allowTap,
        isTouchLikePointerType,
        bind
    };
}

export function getGlobalTouchTapGuard(options = {}) {
    if (globalGuard) return globalGuard;

    globalGuard = createGuard(options);
    try {
        globalGuard.bind(document);
    } catch {
        // ignore
    }

    // 给非 module 的调试/调用方留一个入口
    try {
        window.TokyoRailTouchTapGuard = globalGuard;
    } catch {
        // ignore
    }

    return globalGuard;
}

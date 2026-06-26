import {
    createTouchTapIntentTracker,
    isTouchLikePointer as isTouchLikePointerType
} from '../ui/touchTapIntent.js';

let globalGuard = null;

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

function createGuard({
    maxDurationMs = 500,
    maxMovePx = 12,
    clickWindowMs = 800,
    recentTouchMs = 1200
} = {}) {
    const activePointers = new Set();
    const tracker = createTouchTapIntentTracker({ maxDurationMs, maxMovePx, now: nowMs });
    let lastTouchLikeDownAt = 0;

    const lastGesture = {
        endedAt: 0,
        eligible: false,
        pointerType: 'mouse'
    };

    const onPointerDown = (evt) => {
        const pt = evt?.pointerType;
        if (!isTouchLikePointerType(pt)) return;

        lastTouchLikeDownAt = nowMs();

        const id = evt.pointerId;
        if (id == null) return;

        activePointers.add(id);
        if (activePointers.size === 1) tracker.begin(evt);
        else tracker.markMultiTouch();
    };

    const onPointerMove = (evt) => {
        tracker.move(evt);
    };

    const finishIfLastPointerUp = (pt) => {
        if (activePointers.size) return;

        lastGesture.endedAt = nowMs();
        lastGesture.pointerType = String(pt || 'touch');
    };

    const onPointerUp = (evt) => {
        const pt = evt?.pointerType;
        if (!isTouchLikePointerType(pt)) return;

        const id = evt.pointerId;
        if (id != null) activePointers.delete(id);
        const result = activePointers.size ? { eligible: false } : tracker.finish(evt);
        if (!activePointers.size && result.handled !== true) tracker.cancel();
        if (!activePointers.size) lastGesture.eligible = result.eligible === true;
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
            lastGesture.pointerType = String(pt || 'touch');
            lastGesture.eligible = false;
            tracker.cancel();
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

const toPositiveNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const getRectWidth = (element) => {
    try {
        const width = Number(element?.getBoundingClientRect?.().width);
        return Number.isFinite(width) && width > 0 ? width : 0;
    } catch {
        return 0;
    }
};

const getWidth = (...values) => {
    for (const value of values) {
        const width = Number(value);
        if (Number.isFinite(width) && width > 0) return width;
    }
    return 0;
};

const isElementLike = (value) => !!(
    value
    && typeof value === 'object'
    && typeof value.querySelectorAll === 'function'
);

const isReducedMotion = (win = globalThis.window) => (
    !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
);

export const getOverflowMarqueeKeyframes = ({
    distancePx,
    holdMs = 1800,
    speedPxPerSec = 30,
    minTravelMs = 1200
} = {}) => {
    const distance = Math.max(0, toPositiveNumber(distancePx, 0));
    const hold = Math.max(0, Math.round(toPositiveNumber(holdMs, 1800)));
    const speed = Math.max(1, toPositiveNumber(speedPxPerSec, 30));
    const travel = Math.max(Math.round(toPositiveNumber(minTravelMs, 1200)), Math.round((distance / speed) * 1000));
    const duration = Math.max(1, hold + travel + hold);
    const startPct = Math.min(99, Math.max(0, (hold / duration) * 100));
    const endPct = Math.min(100, Math.max(startPct, ((hold + travel) / duration) * 100));

    return {
        duration,
        keyframes: [
            { transform: 'translateX(0)', offset: 0 },
            { transform: 'translateX(0)', offset: startPct / 100 },
            { transform: `translateX(-${distance}px)`, offset: endPct / 100 },
            { transform: `translateX(-${distance}px)`, offset: 1 }
        ]
    };
};

export const measureOverflowMarquee = (marqueeEl, innerEl) => ({
    viewportW: getWidth(
        marqueeEl?.clientWidth,
        marqueeEl?.offsetWidth,
        getRectWidth(marqueeEl)
    ),
    contentW: getWidth(
        innerEl?.scrollWidth,
        innerEl?.offsetWidth,
        getRectWidth(innerEl)
    )
});

export const applyOverflowMarqueeAnimation = ({
    marqueeEl,
    innerEl,
    viewportW,
    contentW,
    holdMs = 1800,
    speedPxPerSec = 30,
    minTravelMs = 1200
} = {}) => {
    if (!marqueeEl || !innerEl) return false;
    try {
        marqueeEl.__overflowMarqueeAnim?.cancel?.();
    } catch {
        // ignore animation cleanup gaps
    }

    innerEl.style.transform = '';
    marqueeEl.__overflowMarqueeAnim = null;

    if (typeof innerEl.animate !== 'function') return false;
    if (!viewportW || contentW <= viewportW + 1) return false;

    const distancePx = Math.max(0, contentW - viewportW);
    if (!distancePx) return false;

    const { keyframes, duration } = getOverflowMarqueeKeyframes({
        distancePx,
        holdMs,
        speedPxPerSec,
        minTravelMs
    });
    const anim = innerEl.animate(keyframes, {
        duration,
        iterations: Infinity,
        easing: 'linear'
    });
    marqueeEl.__overflowMarqueeAnim = anim;
    return true;
};

export const applyOverflowTextMarquees = (rootEl, {
    marqueeSelector,
    innerSelector,
    scrollContainer = null,
    maxAnimations = Number.POSITIVE_INFINITY,
    respectReducedMotion = false,
    win = globalThis.window,
    holdMs = 1800,
    speedPxPerSec = 30,
    minTravelMs = 1200
} = {}) => {
    try {
        if (!isElementLike(rootEl) || !marqueeSelector || !innerSelector) return 0;
        if (respectReducedMotion && isReducedMotion(win)) return 0;

        const candidates = [];
        const marquees = Array.from(rootEl.querySelectorAll(marqueeSelector));
        for (const marqueeEl of marquees) {
            const innerEl = marqueeEl.querySelector(innerSelector);
            if (!innerEl) continue;
            const { viewportW, contentW } = measureOverflowMarquee(marqueeEl, innerEl);
            if (!viewportW || contentW <= viewportW + 1) {
                applyOverflowMarqueeAnimation({ marqueeEl, innerEl, viewportW, contentW });
                continue;
            }

            let score = 0;
            if (scrollContainer?.getBoundingClientRect) {
                const rowRect = marqueeEl.getBoundingClientRect?.();
                const containerRect = scrollContainer.getBoundingClientRect?.();
                if (rowRect && containerRect) {
                    const visible = rowRect.bottom > containerRect.top && rowRect.top < containerRect.bottom;
                    score = visible ? 0 : Math.min(
                        Math.abs(rowRect.top - containerRect.bottom),
                        Math.abs(rowRect.bottom - containerRect.top)
                    );
                }
            }

            candidates.push({ marqueeEl, innerEl, viewportW, contentW, score });
        }

        candidates.sort((a, b) => a.score - b.score);

        let started = 0;
        for (const candidate of candidates) {
            if (started >= maxAnimations) break;
            const didStart = applyOverflowMarqueeAnimation({
                ...candidate,
                holdMs,
                speedPxPerSec,
                minTravelMs
            });
            if (didStart) started += 1;
        }
        return started;
    } catch {
        return 0;
    }
};

export const scheduleOverflowTextMarquees = (rootEl, options = {}) => {
    try {
        if (!isElementLike(rootEl)) return false;
        const win = options.win || globalThis.window;
        const raf = win?.requestAnimationFrame;
        if (typeof raf !== 'function') return false;

        if (rootEl.__overflowMarqueeRafId) {
            try {
                win?.cancelAnimationFrame?.(rootEl.__overflowMarqueeRafId);
            } catch {
                // ignore
            }
            rootEl.__overflowMarqueeRafId = 0;
        }

        rootEl.__overflowMarqueeRafId = raf(() => {
            rootEl.__overflowMarqueeRafId = raf(() => {
                rootEl.__overflowMarqueeRafId = 0;
                applyOverflowTextMarquees(rootEl, options);
            });
        });
        return true;
    } catch {
        return false;
    }
};

const DEFAULT_ANIMATION_KEY = '__textMarqueeAnim';
const DEFAULT_RAF_KEY = '__textMarqueeRafId';
const DEFAULT_HOLD_MS = 2000;
const DEFAULT_END_HOLD_MS = 2000;
const DEFAULT_MIN_TRAVEL_MS = 1200;
const DEFAULT_SPEED_PX_PER_SEC = 30;

const toPositiveNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const getRectWidth = (el) => {
    const width = Number(el?.getBoundingClientRect?.()?.width);
    return Number.isFinite(width) && width > 0 ? width : 0;
};

export const measureTextMarquee = (marqueeEl, innerEl) => {
    const viewportWidth = Math.max(
        toPositiveNumber(marqueeEl?.clientWidth),
        getRectWidth(marqueeEl)
    );
    const contentWidth = Math.max(
        toPositiveNumber(innerEl?.scrollWidth),
        toPositiveNumber(innerEl?.offsetWidth),
        getRectWidth(innerEl)
    );
    const distancePx = Math.max(0, contentWidth - viewportWidth);
    return { contentWidth, distancePx, viewportWidth };
};

export const buildTextMarqueeAnimation = ({
    distancePx,
    endHoldMs = DEFAULT_END_HOLD_MS,
    holdMs = DEFAULT_HOLD_MS,
    minTravelMs = DEFAULT_MIN_TRAVEL_MS,
    speedPxPerSec = DEFAULT_SPEED_PX_PER_SEC
} = {}) => {
    const distance = Math.max(0, Number(distancePx) || 0);
    const hold = Math.max(0, Number(holdMs) || 0);
    const endHold = Math.max(0, Number(endHoldMs) || 0);
    const speed = Math.max(1, Number(speedPxPerSec) || DEFAULT_SPEED_PX_PER_SEC);
    const minTravel = Math.max(0, Number(minTravelMs) || 0);
    const travelMs = Math.max(minTravel, Math.round((distance / speed) * 1000));
    const totalMs = Math.max(1, hold + travelMs + endHold);
    const startHoldOffset = hold / totalMs;
    const endMoveOffset = (hold + travelMs) / totalMs;

    return {
        keyframes: [
            { transform: 'translateX(0px)', offset: 0 },
            { transform: 'translateX(0px)', offset: startHoldOffset },
            { transform: `translateX(${-distance}px)`, offset: endMoveOffset },
            { transform: `translateX(${-distance}px)`, offset: 1 }
        ],
        options: {
            duration: totalMs,
            iterations: Infinity,
            easing: 'linear'
        }
    };
};

export const cancelTextMarquee = (marqueeEl, {
    animationKey = DEFAULT_ANIMATION_KEY,
    innerEl
} = {}) => {
    try {
        marqueeEl?.[animationKey]?.cancel?.();
    } catch {
        // ignore animation cleanup failures
    }
    if (innerEl?.style) innerEl.style.transform = '';
    if (marqueeEl) marqueeEl[animationKey] = null;
};

export const startTextMarquee = ({
    animationKey = DEFAULT_ANIMATION_KEY,
    endHoldMs = DEFAULT_END_HOLD_MS,
    holdMs = DEFAULT_HOLD_MS,
    innerEl,
    marqueeEl,
    minTravelMs = DEFAULT_MIN_TRAVEL_MS,
    speedPxPerSec = DEFAULT_SPEED_PX_PER_SEC
} = {}) => {
    if (!marqueeEl || !innerEl) return false;
    cancelTextMarquee(marqueeEl, { animationKey, innerEl });

    const { distancePx, viewportWidth } = measureTextMarquee(marqueeEl, innerEl);
    if (!viewportWidth || distancePx <= 1) return false;
    if (typeof innerEl.animate !== 'function') return false;

    const { keyframes, options } = buildTextMarqueeAnimation({
        distancePx,
        endHoldMs,
        holdMs,
        minTravelMs,
        speedPxPerSec
    });
    const anim = innerEl.animate(keyframes, options);
    marqueeEl[animationKey] = anim;
    return true;
};

export const applyTextMarquees = (rootEl, {
    animationKey = DEFAULT_ANIMATION_KEY,
    endHoldMs = DEFAULT_END_HOLD_MS,
    getScore,
    holdMs = DEFAULT_HOLD_MS,
    innerSelector,
    maxAnimations = Number.POSITIVE_INFINITY,
    minTravelMs = DEFAULT_MIN_TRAVEL_MS,
    selector,
    speedPxPerSec = DEFAULT_SPEED_PX_PER_SEC
} = {}) => {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return 0;
    if (!selector || !innerSelector) return 0;

    const candidates = [];
    for (const marqueeEl of Array.from(rootEl.querySelectorAll(selector))) {
        const innerEl = marqueeEl?.querySelector?.(innerSelector);
        if (!innerEl) continue;
        cancelTextMarquee(marqueeEl, { animationKey, innerEl });

        const measurement = measureTextMarquee(marqueeEl, innerEl);
        if (!measurement.viewportWidth || measurement.distancePx <= 1) continue;

        const score = typeof getScore === 'function'
            ? Number(getScore({ innerEl, marqueeEl, measurement }))
            : 0;
        candidates.push({
            innerEl,
            marqueeEl,
            score: Number.isFinite(score) ? score : 0
        });
    }

    candidates.sort((a, b) => a.score - b.score);

    let started = 0;
    for (const candidate of candidates) {
        if (started >= maxAnimations) break;
        const ok = startTextMarquee({
            animationKey,
            endHoldMs,
            holdMs,
            innerEl: candidate.innerEl,
            marqueeEl: candidate.marqueeEl,
            minTravelMs,
            speedPxPerSec
        });
        if (ok) started += 1;
    }
    return started;
};

export const scheduleTextMarqueeApply = (rootEl, {
    apply,
    cancelFrame,
    clearTimer = globalThis.clearTimeout,
    rafKey = DEFAULT_RAF_KEY,
    requestFrame,
    retryDelaysMs = [],
    setTimer = globalThis.setTimeout
} = {}) => {
    if (!rootEl || typeof apply !== 'function') return false;
    const cancel = typeof cancelFrame === 'function' ? cancelFrame : null;
    if (rootEl[rafKey]) {
        try {
            cancel?.(rootEl[rafKey]);
        } catch {
            // ignore
        }
        rootEl[rafKey] = 0;
    }

    const timerKey = `${rafKey}Timers`;
    const timers = Array.isArray(rootEl[timerKey]) ? rootEl[timerKey] : [];
    while (timers.length) {
        const timerId = timers.pop();
        try {
            if (typeof clearTimer === 'function') clearTimer(timerId);
        } catch {
            // ignore
        }
    }
    rootEl[timerKey] = timers;

    const delays = Array.isArray(retryDelaysMs)
        ? retryDelaysMs.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [];
    let retryIndex = 0;

    const runApply = () => {
        const started = Number(apply(rootEl)) || 0;
        if (started > 0 || retryIndex >= delays.length) return started;
        if (typeof setTimer !== 'function') return started;

        const delay = delays[retryIndex];
        retryIndex += 1;
        const timerId = setTimer(() => {
            const index = timers.indexOf(timerId);
            if (index >= 0) timers.splice(index, 1);
            runApply();
        }, delay);
        timers.push(timerId);
        return started;
    };

    if (typeof requestFrame !== 'function') {
        runApply();
        return true;
    }

    rootEl[rafKey] = requestFrame(() => {
        rootEl[rafKey] = requestFrame(() => {
            rootEl[rafKey] = 0;
            runApply();
        });
    });
    return true;
};

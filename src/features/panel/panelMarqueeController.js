export const getPanelMarqueeKeyframes = ({ distancePx, holdMs, speedPxPerSec, minTravelMs }) => {
    const distance = Math.max(0, Number(distancePx) || 0);
    const hold = Math.max(0, Number(holdMs) || 0);
    const speed = Math.max(1, Number(speedPxPerSec) || 1);
    const minTravel = Math.max(0, Number(minTravelMs) || 0);
    const travelMs = Math.max(minTravel, Math.round((distance / speed) * 1000));
    const totalMs = hold + travelMs + hold + hold;
    const startHoldOffset = totalMs ? hold / totalMs : 0;
    const endMoveOffset = totalMs ? (hold + travelMs) / totalMs : 0;
    const endHoldOffset = totalMs ? (hold + travelMs + hold) / totalMs : 0;
    const resetOffset = Math.min(0.999, endHoldOffset + 0.001);

    return {
        duration: totalMs,
        keyframes: [
            { transform: 'translateX(0px)', offset: 0 },
            { transform: 'translateX(0px)', offset: startHoldOffset },
            { transform: `translateX(${-distance}px)`, offset: endMoveOffset },
            { transform: `translateX(${-distance}px)`, offset: endHoldOffset },
            { transform: 'translateX(0px)', offset: resetOffset },
            { transform: 'translateX(0px)', offset: 1 }
        ]
    };
};

export const createPanelMarqueeController = ({
    win = globalThis.window,
    maxAnimations = 30
} = {}) => {
    const getElementCtor = () => win?.Element || globalThis.Element;
    const isElement = (value) => {
        const ElementCtor = getElementCtor();
        return !!(ElementCtor && value instanceof ElementCtor);
    };
    const canAnimate = (innerEl) => typeof innerEl?.animate === 'function';
    const getRectWidth = (el) => {
        try {
            const rect = el?.getBoundingClientRect?.();
            const width = Number(rect?.width);
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
    const measureMarquee = (marqueeEl, innerEl) => {
        const viewportW = getWidth(
            marqueeEl?.clientWidth,
            marqueeEl?.offsetWidth,
            getRectWidth(marqueeEl)
        );
        const contentW = getWidth(
            innerEl?.scrollWidth,
            innerEl?.offsetWidth,
            getRectWidth(innerEl)
        );
        return { viewportW, contentW };
    };
    const isReducedMotion = () => !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const applyMarqueeAnimation = ({
        marqueeEl,
        innerEl,
        viewportW,
        contentW,
        holdMs,
        speedPxPerSec,
        minTravelMs
    }) => {
        if (!marqueeEl || !innerEl) return false;
        try {
            marqueeEl.__panelMarqueeAnim?.cancel?.();
        } catch {
            // ignore
        }

        innerEl.style.transform = '';
        marqueeEl.__panelMarqueeAnim = null;

        if (!canAnimate(innerEl)) return false;
        if (!viewportW || contentW <= viewportW + 1) return false;
        const distancePx = Math.max(0, contentW - viewportW);
        if (!distancePx) return false;

        const { keyframes, duration } = getPanelMarqueeKeyframes({
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
        marqueeEl.__panelMarqueeAnim = anim;
        return true;
    };

    const applyDirHeaderMarquees = (rootEl, maxAnims = Number.POSITIVE_INFINITY) => {
        try {
            if (!isElement(rootEl)) return 0;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-dir-marquee'));
            let started = 0;
            for (const marqueeEl of marquees) {
                if (started >= maxAnims) break;
                const innerEl = marqueeEl.querySelector('.panel-dir-marquee-inner');
                const measurement = measureMarquee(marqueeEl, innerEl);
                const didStart = applyMarqueeAnimation({
                    marqueeEl,
                    innerEl,
                    viewportW: measurement.viewportW,
                    contentW: measurement.contentW,
                    holdMs: 2000,
                    speedPxPerSec: 35,
                    minTravelMs: 1500
                });
                if (didStart) started += 1;
            }
            return started;
        } catch {
            return 0;
        }
    };

    const applyTimetableDestMarquees = (rootEl, maxAnims = maxAnimations) => {
        try {
            if (!isElement(rootEl) || isReducedMotion()) return 0;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-timetable-dest-marquee, .panel-timetable-type-marquee'));
            const candidates = [];
            for (const marqueeEl of marquees) {
                const innerEl = marqueeEl.querySelector('.panel-timetable-dest-marquee-inner, .panel-timetable-type-marquee-inner');
                if (!innerEl) continue;

                try {
                    marqueeEl.__panelMarqueeAnim?.cancel?.();
                } catch {
                    // ignore
                }
                innerEl.style.transform = '';
                marqueeEl.__panelMarqueeAnim = null;

                if (!canAnimate(innerEl)) continue;
                const { viewportW, contentW } = measureMarquee(marqueeEl, innerEl);
                if (!viewportW || contentW <= viewportW + 1) continue;

                const rowEl = marqueeEl.closest?.('.panel-timetable-row');
                const containerEl = marqueeEl.closest?.('.panel-timetable');
                let score = 1e9;
                if (rowEl && containerEl) {
                    const rowRect = rowEl.getBoundingClientRect?.();
                    const containerRect = containerEl.getBoundingClientRect?.();
                    if (rowRect && containerRect) {
                        const visible = rowRect.bottom > containerRect.top && rowRect.top < containerRect.bottom;
                        if (visible) score = 0;
                        else score = Math.min(Math.abs(rowRect.top - containerRect.bottom), Math.abs(rowRect.bottom - containerRect.top));
                    }
                }
                candidates.push({ marqueeEl, innerEl, viewportW, contentW, score });
            }

            candidates.sort((a, b) => a.score - b.score);

            let started = 0;
            for (const candidate of candidates) {
                if (started >= maxAnims) break;
                const didStart = applyMarqueeAnimation({
                    ...candidate,
                    holdMs: 2000,
                    speedPxPerSec: 30,
                    minTravelMs: 1200
                });
                if (didStart) started += 1;
            }
            return started;
        } catch {
            return 0;
        }
    };

    const hookTimetableScrollMarquee = (rootEl) => {
        try {
            if (!isElement(rootEl)) return;
            const raf = win?.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            const bodies = Array.from(rootEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of bodies) {
                if (bodyEl.__panelDestMarqueeHooked) continue;
                bodyEl.__panelDestMarqueeHooked = true;

                let pending = false;
                bodyEl.addEventListener('scroll', () => {
                    if (pending) return;
                    pending = true;
                    raf(() => {
                        pending = false;
                        const used = applyDirHeaderMarquees(bodyEl, maxAnimations);
                        const remain = Math.max(0, maxAnimations - used);
                        applyTimetableDestMarquees(bodyEl, remain);
                    });
                }, { passive: true });
            }
        } catch {
            // ignore
        }
    };

    const schedule = (rootEl) => {
        try {
            if (!isElement(rootEl)) return;
            const raf = win?.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            if (rootEl.__panelMarqueeRafId) {
                try {
                    win?.cancelAnimationFrame?.(rootEl.__panelMarqueeRafId);
                } catch {
                    // ignore
                }
                rootEl.__panelMarqueeRafId = 0;
            }

            rootEl.__panelMarqueeRafId = raf(() => {
                rootEl.__panelMarqueeRafId = raf(() => {
                    rootEl.__panelMarqueeRafId = 0;
                    const used = applyDirHeaderMarquees(rootEl, maxAnimations);
                    const remain = Math.max(0, maxAnimations - used);
                    applyTimetableDestMarquees(rootEl, remain);
                    hookTimetableScrollMarquee(rootEl);
                });
            });
        } catch {
            // ignore
        }
    };

    return {
        applyDirHeaderMarquees,
        applyTimetableDestMarquees,
        hookTimetableScrollMarquee,
        schedule
    };
};

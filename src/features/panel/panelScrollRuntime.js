const defaultToText = (value) => String(value ?? '').trim();

export const createPanelScrollRuntime = ({
    body,
    toText = defaultToText,
    setTimeoutFn = globalThis.setTimeout,
    syncActiveTitle = () => {}
} = {}) => {
    const scrollToLineId = (lineId, options = {}) => {
        const id = toText(lineId);
        if (!id) return false;

        const behavior = options?.behavior === 'auto' ? 'auto' : 'smooth';
        const block = options?.block === 'center' ? 'center' : 'start';

        const findLineEl = () => {
            const all = body?.querySelectorAll?.('[data-line-id]') || [];
            for (const el of all) {
                if (!el?.getAttribute) continue;
                if (toText(el.getAttribute('data-line-id')) === id) return el;
            }
            return null;
        };

        const applyScroll = (lineEl) => {
            if (!lineEl?.getBoundingClientRect || !body?.getBoundingClientRect) return false;
            const bodyRect = body.getBoundingClientRect();
            const lineRect = lineEl.getBoundingClientRect();
            const bodyHeight = Math.max(0, Number(body.clientHeight) || 0);
            const lineHeight = Math.max(0, Number(lineRect.height) || 0);
            const naturalTop = (Number(body.scrollTop) || 0) + (Number(lineRect.top) - Number(bodyRect.top));
            const top = block === 'center'
                ? Math.max(0, naturalTop - Math.max(0, (bodyHeight / 2) - (lineHeight / 2)))
                : Math.max(0, naturalTop);

            try {
                body.scrollTo?.({ top, behavior });
            } catch {
                body.scrollTop = top;
            }
            return true;
        };

        const immediate = findLineEl();
        if (immediate && applyScroll(immediate)) return true;

        setTimeoutFn?.(() => {
            const retry = findLineEl();
            if (retry) applyScroll(retry);
        }, 120);
        return false;
    };

    const getScrollTop = () => {
        try {
            return Math.max(0, Number(body?.scrollTop) || 0);
        } catch {
            return 0;
        }
    };

    const setScrollTop = (top, options = {}) => {
        const next = Math.max(0, Number(top) || 0);
        const behavior = options?.behavior === 'smooth' ? 'smooth' : 'auto';
        try {
            body?.scrollTo?.({ top: next, behavior });
            return true;
        } catch {
            body.scrollTop = next;
            return true;
        }
    };

    const syncPanelTitleForActiveLine = (activeLineId = '') => {
        syncActiveTitle(activeLineId);
    };

    return {
        getScrollTop,
        scrollToLineId,
        setScrollTop,
        syncPanelTitleForActiveLine
    };
};

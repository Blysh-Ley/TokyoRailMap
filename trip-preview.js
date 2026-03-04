const toText = (value) => String(value ?? '').trim();

export const buildTripPreviewKey = (lineId, tripKey) => `${toText(lineId)}||${toText(tripKey)}`;

export function createTripPreviewScheduler(options = {}) {
    const onPreview = typeof options.onPreview === 'function' ? options.onPreview : null;
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function'
        ? options.getHoverPreviewEnabled
        : (() => true);
    const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, Number(options.delayMs)) : 500;

    let timerId = null;
    let candidateKey = null;
    let appliedKey = null;

    const clearPending = () => {
        if (timerId != null) {
            clearTimeout(timerId);
            timerId = null;
        }
        candidateKey = null;
    };

    const dispatchPreview = (previewKey, payload) => {
        if (!onPreview) return;
        try {
            appliedKey = toText(previewKey) || null;
            onPreview(payload);
        } catch {
            // ignore
        }
    };

    const schedule = ({ previewKey, payload, immediate } = {}) => {
        if (!onPreview) return;
        if (!immediate && getHoverPreviewEnabled() === false) return;

        if (immediate) {
            clearPending();
            dispatchPreview(previewKey, payload);
            return;
        }

        clearPending();
        candidateKey = toText(previewKey);
        const key = candidateKey;
        timerId = setTimeout(() => {
            timerId = null;
            if (candidateKey !== key) return;
            candidateKey = null;
            dispatchPreview(previewKey, payload);
        }, delayMs);
    };

    const clearApplied = () => {
        appliedKey = null;
    };

    const reset = () => {
        clearPending();
        clearApplied();
    };

    const isPendingKey = (previewKey) => candidateKey === toText(previewKey);
    const isAppliedKey = (previewKey) => appliedKey === toText(previewKey);

    return {
        schedule,
        clearPending,
        clearApplied,
        reset,
        isPendingKey,
        isAppliedKey,
        getPendingKey: () => candidateKey,
        getAppliedKey: () => appliedKey
    };
}

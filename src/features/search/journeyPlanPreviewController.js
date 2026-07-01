import { MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY } from '../../domain/multiSelectLayerProtocol.js';

export const createJourneyPlanPreviewController = ({
    buildTripPreviewPayloadFromDisplayPlan,
    clearTimeoutFn = globalThis.clearTimeout,
    getDisplayPlanForRow,
    getMultiSelectEnabled = () => globalThis?.__TokyoRailMultiSelectEnabled === true,
    getMultiSelectLayerControl = () => globalThis?.__TokyoRailMultiSelectLayerControl || null,
    multiSelectApi = {},
    mapActions,
    normalizeText,
    setTimeoutFn = globalThis.setTimeout
} = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();
    const previewPool = [];
    let activePreviewKey = '';
    let highlightedPageIndex = -1;
    let pinnedPreviewKey = '';
    let previewHideTimer = null;
    let previewRequestToken = 0;

    const getItemId = (pageIndex) => `trip:journey||preview||auto-${pageIndex}`;

    const isMultiSelectEnabled = () => {
        if (typeof multiSelectApi?.isEnabled === 'function') {
            const enabled = multiSelectApi.isEnabled();
            if (typeof enabled === 'boolean') return enabled;
        }
        return getMultiSelectEnabled?.() === true;
    };

    const runMultiSelectLayerCommand = (action, itemId) => {
        if (typeof multiSelectApi?.runLayerCommand === 'function') {
            const result = multiSelectApi.runLayerCommand(action, itemId);
            if (typeof result === 'boolean') return result;
        }
        const ctrl = getMultiSelectLayerControl?.();
        if (typeof ctrl?.runCommand !== 'function') return false;
        return ctrl.runCommand(action, itemId) === true;
    };

    const cancelHidePreview = () => {
        if (!previewHideTimer) return;
        clearTimeoutFn?.(previewHideTimer);
        previewHideTimer = null;
    };

    const resetPool = () => {
        previewPool.length = 0;
        highlightedPageIndex = -1;
    };

    const buildPool = (rows) => {
        resetPool();
        for (let i = 0; i < (Array.isArray(rows) ? rows.length : 0); i += 1) {
            previewPool.push({
                buttonEl: null,
                itemId: getItemId(i),
                pageIndex: i,
                visible: false
            });
        }
    };

    const bindPageButton = (pageIndex, buttonEl) => {
        const entry = previewPool[pageIndex];
        if (entry) entry.buttonEl = buttonEl;
    };

    const syncVisibility = (pageIndex, { force = false } = {}) => {
        if (!isMultiSelectEnabled()) return false;
        if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= previewPool.length) return false;

        const alreadyExclusive = previewPool.every((entry) => {
            if (!entry) return false;
            return entry.visible === (entry.pageIndex === pageIndex);
        });
        if (!force && highlightedPageIndex === pageIndex && alreadyExclusive) return false;

        for (const entry of previewPool) {
            if (!entry) continue;
            const shouldBeVisible = entry.pageIndex === pageIndex;
            if (entry.visible === shouldBeVisible) continue;
            runMultiSelectLayerCommand(MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY, entry.itemId);
            entry.visible = shouldBeVisible;
        }

        highlightedPageIndex = pageIndex;
        return true;
    };

    const restoreAll = () => {
        if (!isMultiSelectEnabled()) return false;

        let changed = false;
        for (const entry of previewPool) {
            if (!entry || entry.visible !== false) continue;
            runMultiSelectLayerCommand(MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY, entry.itemId);
            entry.visible = true;
            changed = true;
        }
        if (changed) highlightedPageIndex = -1;
        return changed;
    };

    const clearPreview = ({ force = false, clearMapPreview = true } = {}) => {
        if (!force && pinnedPreviewKey) return;
        cancelHidePreview();
        if (!activePreviewKey && !force) return;
        if (clearMapPreview) mapActions?.clearTripPathPreview?.();
        activePreviewKey = '';
        if (force) pinnedPreviewKey = '';
    };

    const resetAfterPlanListClear = () => {
        activePreviewKey = '';
        pinnedPreviewKey = '';
        previewRequestToken += 1;
        cancelHidePreview();
        resetPool();
    };

    const scheduleClearPreview = (delayMs = 120) => {
        cancelHidePreview();
        previewHideTimer = setTimeoutFn?.(() => {
            previewHideTimer = null;
            clearPreview({ force: false });
        }, Math.max(0, Number(delayMs) || 0));
    };

    const applyPreview = async ({ row, previewKey, pin = false, interaction = 'hover', clearBefore = true } = {}) => {
        if (typeof mapActions?.hasAction === 'function' && !mapActions.hasAction('previewTripPath')) return;

        const interactionText = normalize(interaction) || 'hover';
        const fitMode = interactionText === 'click' ? 'commit' : 'preview';
        const token = ++previewRequestToken;
        const displayPlan = await getDisplayPlanForRow?.(row);
        const payload = await buildTripPreviewPayloadFromDisplayPlan?.({ row, displayPlan });
        if (token !== previewRequestToken) return;
        if (!payload) return;

        mapActions?.previewTripPath?.(
            {
                ...(payload || {}),
                __previewInteraction: interactionText,
                fitMode,
                previewKey
            },
            { clearBefore: clearBefore === true, fitMode }
        );

        activePreviewKey = normalize(previewKey);
        if (pin) pinnedPreviewKey = activePreviewKey;
    };

    const highlightAll = async (rows) => {
        if (!isMultiSelectEnabled()) return;
        if (!Array.isArray(rows) || !rows.length) return;

        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            if (!row) continue;
            try {
                await applyPreview({
                    clearBefore: i === 0,
                    interaction: 'auto',
                    pin: false,
                    previewKey: `auto-${i}`,
                    row
                });
            } catch {
                // ignore errors in individual highlighting
            }
        }

        for (const entry of previewPool) {
            if (entry) entry.visible = true;
        }
        highlightedPageIndex = -1;
    };

    return Object.freeze({
        applyPreview,
        bindPageButton,
        buildPool,
        cancelHidePreview,
        clearPreview,
        highlightAll,
        isHighlightedPage: (pageIndex) => highlightedPageIndex === pageIndex,
        resetAfterPlanListClear,
        resetPool,
        restoreAll,
        scheduleClearPreview,
        syncVisibility
    });
};

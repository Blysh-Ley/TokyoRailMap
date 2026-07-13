import { SEARCH_PLANNER_STATE_EVENT } from './searchPlannerShell.js';
import { bindMinutePicker } from './minutePicker.js';

const MINUTE_OPTIONS = Array.from({ length: 25 }, (_, index) => index * 5);
const normalizeText = (value) => String(value ?? '').trim();

export const createSearchHeatmapControl = ({ getActions } = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journey-wait-select search-heatmap-select';
    button.setAttribute('aria-label', '热力图时间');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.title = '热力图时间';

    let minutes = 0;
    let subscription = null;
    let subscriptionActions = null;

    const render = () => {
        button.dataset.value = String(minutes);
        button.textContent = minutes > 0 ? `${minutes}分` : '热力图';
    };

    const ensureSubscription = (actions = getActions?.()) => {
        if (!actions || typeof actions.subscribeReachableStopsHeatmap !== 'function') return;
        if (subscriptionActions === actions && typeof subscription === 'function') return;
        subscription?.();
        subscriptionActions = actions;
        subscription = actions.subscribeReachableStopsHeatmap((event) => {
            const nextMinutes = Number(event?.minutes);
            if (!Number.isFinite(nextMinutes)) return;
            minutes = nextMinutes;
            render();
        });
    };

    const clear = () => {
        const actions = getActions?.();
        ensureSubscription(actions);
        if (typeof actions?.clearReachableStopsOverlay === 'function') {
            actions.clearReachableStopsOverlay();
            return;
        }
        minutes = 0;
        render();
    };

    const picker = bindMinutePicker({
        anchor: button,
        title: '热力图时间',
        options: MINUTE_OPTIONS,
        getValue: () => minutes,
        onConfirm: (value) => {
            const nextMinutes = Number(value) || 0;
            const actions = getActions?.();
            ensureSubscription(actions);
            if (typeof actions?.setReachableStopsHeatmapMinutes === 'function') {
                actions.setReachableStopsHeatmapMinutes(nextMinutes);
            } else if (nextMinutes <= 0) {
                minutes = 0;
                render();
            }
        }
    });

    const drawForStation = async (stationId) => {
        const originStationId = normalizeText(stationId);
        if (!originStationId || minutes <= 0) return false;
        const actions = getActions?.();
        ensureSubscription(actions);
        if (typeof actions?.drawReachableStopsHeatmap !== 'function') return false;
        return actions.drawReachableStopsHeatmap({ originStationId, minutes });
    };

    const onPlannerState = (event) => {
        if (event?.detail?.expanded !== true) return;
        picker.close();
        clear();
    };
    window.addEventListener(SEARCH_PLANNER_STATE_EVENT, onPlannerState);
    render();

    return Object.freeze({
        button,
        clear,
        drawForStation,
        destroy: () => {
            window.removeEventListener(SEARCH_PLANNER_STATE_EVENT, onPlannerState);
            subscription?.();
            picker.destroy();
        }
    });
};

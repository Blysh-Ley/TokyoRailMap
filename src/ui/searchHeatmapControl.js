import { SEARCH_PLANNER_STATE_EVENT } from './searchPlannerShell.js';
import { bindMinutePicker } from './minutePicker.js';

const MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120];
const normalizeText = (value) => String(value ?? '').trim();
// Lucide Radar, ISC: https://lucide.dev/icons/radar
const RADAR_ICON_MARKUP = `
    <span class="search-heatmap-time-label" aria-hidden="true"></span>
    <span class="search-heatmap-icon-shell">
        <svg class="search-heatmap-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/>
            <path d="M4 6h.01"/>
            <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/>
            <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/>
            <path d="M12 18h.01"/>
            <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/>
            <circle cx="12" cy="12" r="2"/>
            <path d="m13.41 10.59 5.66-5.66"/>
        </svg>
    </span>
`;

export const createSearchHeatmapControl = ({ getActions } = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-heatmap-select';
    button.setAttribute('aria-label', '热力图时间');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-pressed', 'false');
    button.title = '热力图时间';
    button.innerHTML = RADAR_ICON_MARKUP;

    let minutes = 0;
    let subscription = null;
    let subscriptionActions = null;

    const render = () => {
        const active = minutes > 0;
        button.dataset.value = String(minutes);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        const timeLabel = button.querySelector('.search-heatmap-time-label');
        if (timeLabel) timeLabel.textContent = active ? `${minutes}分` : '';
        const label = active ? `热力图时间：${minutes}分` : '热力图时间';
        button.setAttribute('aria-label', label);
        button.title = label;
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
        isActive: () => minutes > 0,
        destroy: () => {
            window.removeEventListener(SEARCH_PLANNER_STATE_EVENT, onPlannerState);
            subscription?.();
            picker.destroy();
        }
    });
};

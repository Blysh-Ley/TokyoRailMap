import { SEARCH_PLANNER_STATE_EVENT } from './searchPlannerShell.js';
import { createSearchHeatmapInteraction } from '../features/search/searchHeatmapInteraction.js';
import { createSearchHeatmapFormView } from './searchHeatmapFormView.js';
import { MOBILE_BOTTOM_NAV_EVENT } from './mobileBottomNav.js';

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

export const createSearchHeatmapControl = ({
    getActions,
    searchRoot,
    searchStations,
    loadHistory,
    addHistory,
    historyView,
    focusStationOnOpen = true,
    onOpen
} = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-heatmap-select';
    button.setAttribute('aria-label', '出行热图');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-pressed', 'false');
    button.title = '出行热图';
    button.innerHTML = RADAR_ICON_MARKUP;

    const interaction = createSearchHeatmapInteraction({ getActions, searchStations, loadHistory, addHistory });
    const clear = () => interaction.dispatch({ type: 'close' });
    const view = createSearchHeatmapFormView({ interaction, historyView, onClose: clear });
    searchRoot.appendChild(view.form);
    const render = (state) => {
        searchRoot.classList.toggle('is-heatmap-open', state.visible);
        if (state.visible) searchRoot.classList.remove('is-collapsed');
        button.classList.toggle('is-active', state.open);
        button.setAttribute('aria-pressed', String(state.open));
        button.setAttribute('aria-expanded', String(state.visible));
    };
    const subscription = interaction.subscribe(render);
    const isOutsideMobileSearch = () => {
        const root = document.documentElement.dataset;
        const body = document.body.dataset;
        return (root.mobileUi === '1' || body.mobileUi === '1')
            && (root.mobileNavActive || body.mobileNavActive) !== 'search';
    };
    const open = () => {
        onOpen?.();
        interaction.dispatch({ type: 'open' });
    };
    const openForStation = ({ stationId, stationName } = {}) => {
        open();
        return interaction.dispatch({ type: 'selectStation', payload: { id: stationId, text: stationName || stationId } });
    };
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
        if (focusStationOnOpen) view.focusStationInput();
    });
    const onPlannerState = (event) => {
        if (event?.detail?.expanded !== true && !isOutsideMobileSearch()) return;
        view.closePicker();
        interaction.dispatch({ type: 'suspend', payload: { navigation: event?.detail?.expanded !== true } });
    };
    const onMobileNav = (event) => {
        if (!interaction.getState().open) return;
        if (event?.detail?.item === 'search') {
            if (interaction.getState().resumeOnSearch) open();
        } else interaction.dispatch({ type: 'suspend', payload: { navigation: true } });
    };
    window.addEventListener(SEARCH_PLANNER_STATE_EVENT, onPlannerState);
    window.addEventListener(MOBILE_BOTTOM_NAV_EVENT, onMobileNav);
    render(interaction.getState());

    return Object.freeze({
        button,
        clear,
        isActive: () => interaction.getState().visible && !isOutsideMobileSearch(),
        isSessionOpen: () => interaction.getState().open,
        isMapPickActive: () => interaction.getState().visible && !isOutsideMobileSearch() && interaction.getState().picking,
        open,
        openForStation,
        pickStation: ({ stationId, stationName } = {}) => interaction.dispatch({
            type: 'selectStation', payload: { id: stationId, text: stationName || stationId }
        }),
        destroy: () => {
            window.removeEventListener(SEARCH_PLANNER_STATE_EVENT, onPlannerState);
            window.removeEventListener(MOBILE_BOTTOM_NAV_EVENT, onMobileNav);
            subscription?.();
            view.destroy();
        }
    });
};

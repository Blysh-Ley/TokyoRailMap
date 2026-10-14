import { SEARCH_PLANNER_STATE_EVENT, isSearchPlannerExpanded, setSearchPlannerExpanded } from './searchPlannerShell.js';
import { createSearchHeatmapInteraction } from '../features/search/searchHeatmapInteraction.js';
import { journeyRuntimeAdapter } from '../features/search/journeyRuntimeAdapter.js';
import { createSearchHeatmapFormView } from './searchHeatmapFormView.js';
import { MOBILE_BOTTOM_NAV_EVENT } from './mobileBottomNav.js';
import { createSearchPlanningModeView } from './searchPlanningModeView.js';

const HEATMAP_ICON_MARKUP = `
    <span class="search-heatmap-time-label" aria-hidden="true"></span>
    <span class="search-heatmap-icon-shell">
        <span class="search-heatmap-icon" aria-hidden="true"></span>
    </span>
`;

export const createSearchHeatmapControl = ({
    getActions,
    searchRoot,
    readEntries,
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
    button.innerHTML = HEATMAP_ICON_MARKUP;

    const interaction = createSearchHeatmapInteraction({
        getActions,
        readEntries,
        searchStations,
        loadHistory,
        addHistory
    });
    const clear = () => interaction.dispatch({ type: 'close' });
    const view = createSearchHeatmapFormView({ interaction, historyView, onClose: clear });
    searchRoot.appendChild(view.form);
    const modeView = createSearchPlanningModeView({
        searchRoot,
        onToggle: () => {
            if (interaction.getState().visible) {
                view.closePicker();
                interaction.dispatch({ type: 'suspend', payload: { navigation: false } });
                // 复用空输入框的历史入口，避免规划会话清理后首次聚焦只清空列表。
                journeyRuntimeAdapter.getJourneyUI()?.showHistoryForNextEmptyField?.();
                setSearchPlannerExpanded(true, { focusJourney: true });
            } else {
                open();
                view.focusStationInput();
            }
        }
    });
    const syncModeView = () => modeView.render({
        plannerExpanded: isSearchPlannerExpanded(),
        heatmapVisible: interaction.getState().visible
    });
    const render = (state) => {
        searchRoot.classList.toggle('is-heatmap-open', state.visible);
        if (state.visible) searchRoot.classList.remove('is-collapsed');
        button.classList.toggle('is-active', state.open);
        button.setAttribute('aria-pressed', String(state.open));
        button.setAttribute('aria-expanded', String(state.visible));
        syncModeView();
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
        if (event?.detail?.expanded !== true && !isOutsideMobileSearch()) {
            syncModeView();
            return;
        }
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
            modeView.destroy();
            view.destroy();
        }
    });
};

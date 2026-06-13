export const PANEL_MOBILE_STACK_SCREENS = Object.freeze({
    STATION_OVERVIEW: 'stationOverview',
    LINE_TIMETABLE: 'lineTimetable',
    TRIP_DETAIL: 'tripDetail'
});

const toText = (value) => String(value ?? '').trim();

const createDefaultState = () => ({
    isOpen: false,
    screen: PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW,
    stationId: '',
    stationName: '',
    lineId: '',
    tripKey: '',
    lockedHighlightKind: ''
});

const freezeState = (state) => Object.freeze({ ...state });

export const createPanelMobileStackController = ({
    initialState = {},
    onChange = null
} = {}) => {
    let state = freezeState({
        ...createDefaultState(),
        ...initialState
    });

    const emit = (action, previous) => {
        if (typeof onChange !== 'function') return;
        onChange({
            action,
            previous: freezeState(previous),
            state
        });
    };

    const setState = (patch, action) => {
        const previous = state;
        state = freezeState({
            ...state,
            ...patch
        });
        emit(action, previous);
        return state;
    };

    const openStationOverview = ({
        stationId = state.stationId,
        stationName = state.stationName
    } = {}) => setState({
        isOpen: true,
        screen: PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW,
        stationId: toText(stationId),
        stationName: toText(stationName),
        lineId: '',
        tripKey: '',
        lockedHighlightKind: ''
    }, 'openStationOverview');

    const openLineTimetable = ({
        stationId = state.stationId,
        stationName = state.stationName,
        lineId
    } = {}) => {
        const nextLineId = toText(lineId);
        if (!nextLineId) return state;
        return setState({
            isOpen: true,
            screen: PANEL_MOBILE_STACK_SCREENS.LINE_TIMETABLE,
            stationId: toText(stationId),
            stationName: toText(stationName),
            lineId: nextLineId,
            tripKey: '',
            lockedHighlightKind: 'line'
        }, 'openLineTimetable');
    };

    const openTripDetail = ({
        stationId = state.stationId,
        stationName = state.stationName,
        lineId = state.lineId,
        tripKey
    } = {}) => {
        const nextLineId = toText(lineId);
        const nextTripKey = toText(tripKey);
        if (!nextLineId || !nextTripKey) return state;
        return setState({
            isOpen: true,
            screen: PANEL_MOBILE_STACK_SCREENS.TRIP_DETAIL,
            stationId: toText(stationId),
            stationName: toText(stationName),
            lineId: nextLineId,
            tripKey: nextTripKey,
            lockedHighlightKind: 'trip'
        }, 'openTripDetail');
    };

    const back = () => {
        if (state.screen === PANEL_MOBILE_STACK_SCREENS.TRIP_DETAIL) {
            return setState({
                screen: PANEL_MOBILE_STACK_SCREENS.LINE_TIMETABLE,
                tripKey: '',
                lockedHighlightKind: state.lineId ? 'line' : ''
            }, 'backToLineTimetable');
        }

        if (state.screen === PANEL_MOBILE_STACK_SCREENS.LINE_TIMETABLE) {
            return setState({
                screen: PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW,
                lineId: '',
                tripKey: '',
                lockedHighlightKind: ''
            }, 'backToStationOverview');
        }

        return state;
    };

    const close = () => setState({
        isOpen: false,
        screen: PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW,
        lineId: '',
        tripKey: '',
        lockedHighlightKind: ''
    }, 'close');

    return Object.freeze({
        back,
        close,
        getState: () => state,
        openLineTimetable,
        openStationOverview,
        openTripDetail
    });
};

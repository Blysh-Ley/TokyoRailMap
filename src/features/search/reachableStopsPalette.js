export const REACHABLE_STOPS_COLOR_STOPS = Object.freeze([
    1,
    18,
    36,
    72,
    144,
    288,
    576,
    1152,
    2304,
    3200
]);

export const REACHABLE_STOPS_PALETTES = Object.freeze({
    light: Object.freeze([
        '#FFEE99',
        '#FFE08A',
        '#FFCF75',
        '#FFBA66',
        '#FFA557',
        '#FF8742',
        '#FF6D33',
        '#FF4C24',
        '#FF270F',
        '#FF0000'
    ]),
    dark: Object.freeze([
        '#FFEE99',
        '#FFE08A',
        '#FFCF75',
        '#FFBA66',
        '#FFA557',
        '#FF8742',
        '#FF6D33',
        '#FF4C24',
        '#FF270F',
        '#FF0000'
    ])
});

export const REACHABLE_STOPS_STROKE_COLORS = Object.freeze({
    light: '#5F6670',
    dark: '#E5E7EB'
});

export const normalizeReachableStopsPaletteTheme = (theme) => (
    theme === 'dark' ? 'dark' : 'light'
);

export const getReachableStopsPalette = (theme = 'light') => (
    REACHABLE_STOPS_PALETTES[normalizeReachableStopsPaletteTheme(theme)]
);

export const getReachableStopsStrokeColor = (theme = 'light') => (
    REACHABLE_STOPS_STROKE_COLORS[normalizeReachableStopsPaletteTheme(theme)]
);

export const createReachableStopsColorExpression = (theme = 'light') => {
    const palette = getReachableStopsPalette(theme);
    const countExpression = [
        'coalesce',
        ['get', 'departureOpportunityCount'],
        ['get', 'shiftCount'],
        0
    ];
    const expression = [
        'interpolate-lab',
        ['linear'],
        countExpression,
        0,
        'rgba(0, 0, 0, 0)'
    ];

    for (let i = 0; i < REACHABLE_STOPS_COLOR_STOPS.length; i += 1) {
        expression.push(REACHABLE_STOPS_COLOR_STOPS[i], palette[i]);
    }
    return expression;
};

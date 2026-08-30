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
        '#FFF7BC',
        '#FEE391',
        '#FEC44F',
        '#FE9929',
        '#EC7014',
        '#CC4C02',
        '#A63603',
        '#7F2704',
        '#5A1A1A',
        '#3A0A18'
    ]),
    dark: Object.freeze([
        '#3B0F70',
        '#5C1A80',
        '#7D258C',
        '#A32E8C',
        '#CB3E72',
        '#E85A47',
        '#F6812D',
        '#FCA636',
        '#F8D44A',
        '#FCFFA4'
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

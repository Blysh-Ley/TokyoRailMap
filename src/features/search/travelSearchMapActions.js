const getSearchMapActions = () => globalThis?.TokyoRailSearchMapActions || null;

const hasSearchMapAction = (name) => {
    const actions = getSearchMapActions();
    return typeof actions?.[name] === 'function';
};

const callSearchMapAction = (name, ...args) => {
    const actions = getSearchMapActions();
    const fn = actions?.[name];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(actions, args);
};

export const travelSearchMapActions = Object.freeze({
    clearJourneyPickPin: (type) => callSearchMapAction('clearJourneyPickPin', type),
    clearReachableStopsOverlay: () => callSearchMapAction('clearReachableStopsOverlay'),
    clearTripPathPreview: () => callSearchMapAction('clearTripPathPreview'),
    hasAction: (name) => hasSearchMapAction(name),
    isMultiSelectModeEnabled: () => (
        hasSearchMapAction('isMultiSelectModeEnabled')
            ? callSearchMapAction('isMultiSelectModeEnabled') === true
            : undefined
    ),
    onMapPickClick: (listener) => callSearchMapAction('onMapPickClick', listener) ?? false,
    previewTripPath: (payload, options) => callSearchMapAction('previewTripPath', payload, options),
    runMultiSelectLayerCommand: (action, itemId) => (
        hasSearchMapAction('runMultiSelectLayerCommand')
            ? callSearchMapAction('runMultiSelectLayerCommand', action, itemId) === true
            : undefined
    ),
    showJourneyPickPin: (payload) => callSearchMapAction('showJourneyPickPin', payload),
    updateReachableStopsOverlay: (payload) => callSearchMapAction('updateReachableStopsOverlay', payload)
});

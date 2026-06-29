import {
    mountAboutControl,
    mountAdaptiveViewportToggle,
    mountAppearanceToggle,
    mountAutoUpdateToggle,
    mountBasemapToggle,
    mountDesktopLayoutToggle,
    mountHoverPreviewToggle,
    mountLineNameLabelsToggle,
    mountStationLabelToggle,
    mountStationOffsetToggle,
    mountTimetableViewToggle,
    mountTripPastDimmingToggle
} from '../features/settings/settingsControls.js';

const DEFAULT_CONTROLS = Object.freeze({
    mountAboutControl,
    mountAdaptiveViewportToggle,
    mountAppearanceToggle,
    mountAutoUpdateToggle,
    mountBasemapToggle,
    mountDesktopLayoutToggle,
    mountHoverPreviewToggle,
    mountLineNameLabelsToggle,
    mountStationLabelToggle,
    mountStationOffsetToggle,
    mountTimetableViewToggle,
    mountTripPastDimmingToggle
});

export const dedupeSettingsControls = (hostEl) => {
    const host = hostEl && hostEl.children ? hostEl : null;
    if (!host) return;

    const seen = new Set();
    for (const child of Array.from(host.children)) {
        if (!child?.classList?.contains('settings-item')) continue;
        const key = Array.from(child.classList)
            .filter((name) => name !== 'settings-item' && name !== 'is-disabled')
            .sort()
            .join('|') || child.className;
        if (!key || !seen.has(key)) {
            if (key) seen.add(key);
            continue;
        }
        child.remove?.();
    }
};

export const shouldMountSettingsControls = (hostEl) => !(
    hostEl?.dataset?.tokyoRailSettingsControlsMounted === 'true'
    || hostEl?.querySelector?.(':scope > .settings-item')
);

export const mountAppSettingsControls = ({
    hostEl,
    basemapThemeRuntime,
    updateApi,
    electronApi,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache,
    onAdaptiveViewportEnabledChanged,
    onDesktopLayoutEnabledChanged,
    onHoverPreviewEnabledChanged,
    onLineNameLabelsEnabledChanged,
    onStationLabelModeChanged,
    onStationLabelUserModeChanged,
    onStationOffsetModeChanged,
    onThemeChanged,
    onTimetableViewModeChanged,
    onTripPastDimmingEnabledChanged,
    stationLabelMode,
    controls = DEFAULT_CONTROLS
} = {}) => {
    dedupeSettingsControls(hostEl);

    if (!shouldMountSettingsControls(hostEl)) {
        return {
            mounted: false,
            hoverPreviewToggleController: null,
            setStationLabelMode: null
        };
    }

    if (hostEl?.dataset) {
        hostEl.dataset.tokyoRailSettingsControlsMounted = 'true';
    }

    controls.mountAppearanceToggle({
        hostEl,
        onThemeChanged: ({ theme }) => {
            basemapThemeRuntime?.applyAppTheme?.(theme);
            onThemeChanged?.(theme);
        }
    });

    controls.mountAutoUpdateToggle({
        hostEl,
        updateApi: updateApi ?? electronApi,
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache
    });

    controls.mountBasemapToggle({
        hostEl,
        onModeChanged: basemapThemeRuntime?.setBasemapMode
    });

    controls.mountAdaptiveViewportToggle({
        hostEl,
        onEnabledChanged: onAdaptiveViewportEnabledChanged
    });

    controls.mountDesktopLayoutToggle?.({
        hostEl,
        onEnabledChanged: onDesktopLayoutEnabledChanged
    });

    controls.mountStationOffsetToggle({
        hostEl,
        onModeChanged: onStationOffsetModeChanged
    });

    controls.mountLineNameLabelsToggle({
        hostEl,
        onEnabledChanged: onLineNameLabelsEnabledChanged
    });

    const hoverPreviewToggleController = controls.mountHoverPreviewToggle({
        hostEl,
        onEnabledChanged: onHoverPreviewEnabledChanged
    });

    controls.mountTripPastDimmingToggle?.({
        hostEl,
        onEnabledChanged: onTripPastDimmingEnabledChanged
    });

    const stationLabelController = controls.mountStationLabelToggle({
        hostEl,
        initialMode: stationLabelMode,
        onModeChanged: onStationLabelModeChanged,
        onUserModeChanged: onStationLabelUserModeChanged
    });

    controls.mountAboutControl?.({
        hostEl
    });

    return {
        mounted: true,
        hoverPreviewToggleController,
        setStationLabelMode: (mode, options = {}) => stationLabelController.setMode(mode, options)
    };
};

import {
    mountAdaptiveViewportToggle,
    mountAppearanceToggle,
    mountAutoUpdateToggle,
    mountBasemapToggle,
    mountHoverPreviewToggle,
    mountStationLabelToggle,
    mountStationOffsetToggle,
    mountTimetableViewToggle
} from '../features/settings/settingsControls.js';

const DEFAULT_CONTROLS = Object.freeze({
    mountAdaptiveViewportToggle,
    mountAppearanceToggle,
    mountAutoUpdateToggle,
    mountBasemapToggle,
    mountHoverPreviewToggle,
    mountStationLabelToggle,
    mountStationOffsetToggle,
    mountTimetableViewToggle
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
    electronApi,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache,
    onAdaptiveViewportEnabledChanged,
    onHoverPreviewEnabledChanged,
    onStationLabelModeChanged,
    onStationLabelUserModeChanged,
    onStationOffsetModeChanged,
    onThemeChanged,
    onTimetableViewModeChanged,
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
        electronApi,
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache
    });

    controls.mountBasemapToggle({
        hostEl,
        onModeChanged: basemapThemeRuntime?.setBasemapMode
    });

    controls.mountTimetableViewToggle({
        hostEl,
        getIconCandidates,
        getPreferredCachedImageSrc,
        onModeChanged: onTimetableViewModeChanged,
        setImageElementFromCache
    });

    controls.mountAdaptiveViewportToggle({
        hostEl,
        onEnabledChanged: onAdaptiveViewportEnabledChanged
    });

    controls.mountStationOffsetToggle({
        hostEl,
        onModeChanged: onStationOffsetModeChanged
    });

    const hoverPreviewToggleController = controls.mountHoverPreviewToggle({
        hostEl,
        onEnabledChanged: onHoverPreviewEnabledChanged
    });

    const stationLabelController = controls.mountStationLabelToggle({
        hostEl,
        initialMode: stationLabelMode,
        onModeChanged: onStationLabelModeChanged,
        onUserModeChanged: onStationLabelUserModeChanged
    });

    return {
        mounted: true,
        hoverPreviewToggleController,
        setStationLabelMode: (mode, options = {}) => stationLabelController.setMode(mode, options)
    };
};

import assert from 'node:assert/strict';

import {
    dedupeSettingsControls,
    mountAppSettingsControls,
    shouldMountSettingsControls
} from '../src/app/settingsControlsRuntime.js';

const createClassList = (...names) => {
    const values = [...names];
    values.contains = (name) => values.includes(name);
    return values;
};

const createChild = (...classes) => ({
    classList: createClassList(...classes),
    className: classes.join(' ')
});

const createHost = (children = []) => {
    const host = {
        children,
        dataset: {},
        querySelector: (selector) => {
            if (selector !== ':scope > .settings-item') return null;
            return host.children.find((child) => child?.classList?.contains('settings-item')) || null;
        }
    };
    for (const child of children) {
        child.remove = () => {
            const index = host.children.indexOf(child);
            if (index >= 0) host.children.splice(index, 1);
        };
    }
    return host;
};

const createControls = (calls) => ({
    mountAboutControl: (args) => calls.push(['about', args]),
    mountAppearanceToggle: (args) => calls.push(['appearance', args]),
    mountAutoUpdateToggle: (args) => calls.push(['autoUpdate', args]),
    mountBasemapToggle: (args) => calls.push(['basemap', args]),
    mountDesktopLayoutToggle: (args) => calls.push(['desktopLayout', args]),
    mountTimetableViewToggle: (args) => calls.push(['timetable', args]),
    mountAdaptiveViewportToggle: (args) => calls.push(['adaptive', args]),
    mountStationOffsetToggle: (args) => calls.push(['stationOffset', args]),
    mountTimezoneToggle: (args) => calls.push(['timezone', args]),
    mountLineNameLabelsToggle: (args) => calls.push(['lineNameLabels', args]),
    mountHoverPreviewToggle: (args) => {
        calls.push(['hoverPreview', args]);
        return { id: 'hover-controller' };
    },
    mountStationLabelToggle: (args) => {
        calls.push(['stationLabel', args]);
        return {
            setMode: (mode, options) => {
                calls.push(['stationLabel.setMode', mode, options]);
                return mode === 'all';
            }
        };
    }
});

{
    const host = createHost([
        createChild('settings-item', 'settings-item-basemap'),
        createChild('settings-item', 'settings-item-basemap'),
        createChild('settings-item', 'settings-item-appearance')
    ]);

    dedupeSettingsControls(host);
    assert.equal(host.children.length, 2);
    assert.equal(shouldMountSettingsControls(host), false);
}

{
    const calls = [];
    const effects = [];
    const basemapThemeRuntime = {
        applyAppTheme: (theme) => effects.push(['applyAppTheme', theme]),
        setBasemapMode: (mode) => effects.push(['setBasemapMode', mode])
    };
    const host = createHost();

    const runtime = mountAppSettingsControls({
        hostEl: host,
        basemapThemeRuntime,
        controls: createControls(calls),
        updateApi: { id: 'update' },
        getIconCandidates: () => ['icon.svg'],
        getPreferredCachedImageSrc: () => 'icon.svg',
        onAdaptiveViewportEnabledChanged: (enabled) => effects.push(['adaptive', enabled]),
        onDesktopLayoutEnabledChanged: (enabled) => effects.push(['desktopLayout', enabled]),
        onHoverPreviewEnabledChanged: (enabled) => effects.push(['hover', enabled]),
        onLineNameLabelsEnabledChanged: (enabled) => effects.push(['lineNameLabels', enabled]),
        onStationLabelModeChanged: (mode) => effects.push(['stationLabelMode', mode]),
        onStationLabelUserModeChanged: (mode) => effects.push(['stationLabelUserMode', mode]),
        onStationOffsetModeChanged: (mode) => effects.push(['stationOffset', mode]),
        onThemeChanged: (theme) => effects.push(['themeChanged', theme]),
        onTimezoneModeChanged: (mode) => effects.push(['timezone', mode]),
        onTimetableViewModeChanged: (mode) => effects.push(['timetable', mode]),
        setImageElementFromCache: () => {},
        stationLabelMode: 'auto'
    });

    assert.equal(runtime.mounted, true);
    assert.equal(host.dataset.tokyoRailSettingsControlsMounted, 'true');
    assert.deepEqual(calls.map(([name]) => name), [
        'appearance',
        'autoUpdate',
        'basemap',
        'timezone',
        'adaptive',
        'desktopLayout',
        'stationOffset',
        'lineNameLabels',
        'hoverPreview',
        'stationLabel',
        'about'
    ]);
    assert.deepEqual(runtime.hoverPreviewToggleController, { id: 'hover-controller' });

    const getArgs = (name) => calls.find(([callName]) => callName === name)?.[1];
    assert.deepEqual(getArgs('autoUpdate').updateApi, { id: 'update' });
    getArgs('appearance').onThemeChanged({ theme: 'dark' });
    getArgs('basemap').onModeChanged('osm-detailed');
    getArgs('timezone').onModeChanged('japan');
    getArgs('adaptive').onEnabledChanged(false);
    getArgs('desktopLayout').onEnabledChanged(true);
    getArgs('stationOffset').onModeChanged('performance');
    getArgs('lineNameLabels').onEnabledChanged(false);
    getArgs('hoverPreview').onEnabledChanged(true);
    getArgs('stationLabel').onModeChanged('all');
    getArgs('stationLabel').onUserModeChanged('all');

    assert.equal(runtime.setStationLabelMode('all', { fromUser: true }), true);
    assert.deepEqual(effects, [
        ['applyAppTheme', 'dark'],
        ['themeChanged', 'dark'],
        ['setBasemapMode', 'osm-detailed'],
        ['timezone', 'japan'],
        ['adaptive', false],
        ['desktopLayout', true],
        ['stationOffset', 'performance'],
        ['lineNameLabels', false],
        ['hover', true],
        ['stationLabelMode', 'all'],
        ['stationLabelUserMode', 'all']
    ]);
    assert.deepEqual(calls.at(-1), ['stationLabel.setMode', 'all', { fromUser: true }]);
}

{
    const calls = [];
    const host = createHost();
    host.dataset.tokyoRailSettingsControlsMounted = 'true';

    const runtime = mountAppSettingsControls({
        hostEl: host,
        controls: createControls(calls)
    });

    assert.equal(runtime.mounted, false);
    assert.deepEqual(calls, []);
}

console.log('app settings controls runtime smoke ok');

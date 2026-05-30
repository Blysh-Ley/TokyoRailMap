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
    mountAppearanceToggle: (args) => calls.push(['appearance', args]),
    mountAutoUpdateToggle: (args) => calls.push(['autoUpdate', args]),
    mountBasemapToggle: (args) => calls.push(['basemap', args]),
    mountTimetableViewToggle: (args) => calls.push(['timetable', args]),
    mountAdaptiveViewportToggle: (args) => calls.push(['adaptive', args]),
    mountStationOffsetToggle: (args) => calls.push(['stationOffset', args]),
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
        electronApi: { id: 'electron' },
        getIconCandidates: () => ['icon.svg'],
        getPreferredCachedImageSrc: () => 'icon.svg',
        onAdaptiveViewportEnabledChanged: (enabled) => effects.push(['adaptive', enabled]),
        onHoverPreviewEnabledChanged: (enabled) => effects.push(['hover', enabled]),
        onStationLabelModeChanged: (mode) => effects.push(['stationLabelMode', mode]),
        onStationLabelUserModeChanged: (mode) => effects.push(['stationLabelUserMode', mode]),
        onStationOffsetModeChanged: (mode) => effects.push(['stationOffset', mode]),
        onThemeChanged: (theme) => effects.push(['themeChanged', theme]),
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
        'timetable',
        'adaptive',
        'stationOffset',
        'hoverPreview',
        'stationLabel'
    ]);
    assert.deepEqual(runtime.hoverPreviewToggleController, { id: 'hover-controller' });

    const getArgs = (name) => calls.find(([callName]) => callName === name)?.[1];
    getArgs('appearance').onThemeChanged({ theme: 'dark' });
    getArgs('basemap').onModeChanged('ost');
    getArgs('timetable').onModeChanged('diagram');
    getArgs('adaptive').onEnabledChanged(false);
    getArgs('stationOffset').onModeChanged('performance');
    getArgs('hoverPreview').onEnabledChanged(true);
    getArgs('stationLabel').onModeChanged('all');
    getArgs('stationLabel').onUserModeChanged('all');

    assert.equal(runtime.setStationLabelMode('all', { fromUser: true }), true);
    assert.deepEqual(effects, [
        ['applyAppTheme', 'dark'],
        ['themeChanged', 'dark'],
        ['setBasemapMode', 'ost'],
        ['timetable', 'diagram'],
        ['adaptive', false],
        ['stationOffset', 'performance'],
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

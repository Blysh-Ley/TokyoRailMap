export const PROJECT_NOTICE = Object.freeze({
    name: 'TokyoRailMap',
    displayName: '东京铁路图',
    copyright: 'Copyright (c) 2026 Blysh',
    license: 'MIT License',
    privacyPolicyUrl: './privacy-policy.html',
    licenseSummary: '本项目以 MIT License 开源。你可以自由使用、复制、修改、合并、发布、分发、再授权和销售本软件副本，但需保留版权声明和许可声明；软件按原样提供，不附带任何担保。'
});

export const OPEN_SOURCE_NOTICES = Object.freeze([
    {
        name: 'MapLibre GL JS',
        license: 'BSD-3-Clause',
        url: 'https://maplibre.org/'
    },
    {
        name: 'JSZip',
        license: 'MIT OR GPL-3.0-or-later',
        url: 'https://stuk.github.io/jszip/'
    },
    {
        name: 'pako',
        license: 'MIT',
        url: 'https://github.com/nodeca/pako'
    },
    {
        name: 'japanese-holidays',
        license: 'MIT',
        url: 'https://github.com/osamutake/japanese-holidays-js'
    },
    {
        name: 'Electron',
        license: 'MIT',
        url: 'https://www.electronjs.org/'
    },
    {
        name: 'electron-updater',
        license: 'MIT',
        url: 'https://www.electron.build/auto-update'
    },
    {
        name: 'electron-builder',
        license: 'MIT',
        url: 'https://www.electron.build/'
    },
    {
        name: 'Capacitor',
        license: 'MIT',
        url: 'https://capacitorjs.com/'
    },
    {
        name: '@capacitor-community/media',
        license: 'MIT',
        url: 'https://github.com/capacitor-community/media'
    },
    {
        name: 'live-server',
        license: 'MIT',
        url: 'https://github.com/tapio/live-server'
    },
    {
        name: 'Lucide',
        license: 'ISC',
        url: 'https://lucide.dev/'
    },
    {
        name: 'Feather Icons',
        license: 'MIT',
        url: 'https://feathericons.com/'
    }
]);

export const DATA_SOURCE_NOTICES = Object.freeze([
    {
        name: 'OpenStreetMap contributors',
        license: 'ODbL',
        role: '地图数据与底图来源',
        url: 'https://www.openstreetmap.org/copyright'
    },
    {
        name: 'OpenFreeMap',
        license: 'OpenMapTiles / OpenStreetMap attribution',
        role: '详细、深色详细与 3D 在线底图服务',
        url: 'https://openfreemap.org/'
    },
    {
        name: 'mini-tokyo-3d',
        license: 'MIT',
        role: '铁路数据参考',
        url: 'https://github.com/nagix/mini-tokyo-3d'
    },
    {
        name: 'FareMapTokyo',
        license: 'MIT',
        role: '票价数据参考',
        url: 'https://github.com/fksms/FareMapTokyo'
    },
    {
        name: 'TokyoGTFS',
        license: 'CC0',
        role: '仅使用线路与站点编号等简单静态数据',
        url: 'https://github.com/MKuranowski/TokyoGTFS'
    }
]);

export const getAboutNoticeModel = () => ({
    project: PROJECT_NOTICE,
    libraries: OPEN_SOURCE_NOTICES,
    dataSources: DATA_SOURCE_NOTICES
});

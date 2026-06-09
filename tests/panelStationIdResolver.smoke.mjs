import assert from 'node:assert/strict';

import { resolvePanelStationIdForLine } from '../src/features/panel/panelStationIdResolver.js';

assert.equal(
    await resolvePanelStationIdForLine({
        lineId: 'JR-East.Yamanote',
        currentStationId: 'JR-East.Yamanote.Akihabara'
    }),
    'JR-East.Yamanote.Akihabara'
);

assert.equal(
    await resolvePanelStationIdForLine({
        lineId: 'TokyoMetro.Hibiya',
        currentStationId: 'JR-East.Yamanote.Akihabara',
        getStationGroupsIndex: async () => new Map([
            ['JR-East.Yamanote.Akihabara', [
                'JR-East.Yamanote.Akihabara',
                'TokyoMetro.Hibiya.Akihabara'
            ]]
        ])
    }),
    'TokyoMetro.Hibiya.Akihabara'
);

assert.equal(
    await resolvePanelStationIdForLine({
        lineId: 'MIR.TsukubaExpress',
        currentStationId: 'JR-East.Yamanote.Akihabara',
        currentStationNameZh: '秋叶原',
        getStationGroupsIndex: async () => {
            throw new Error('groups unavailable');
        },
        getStationsIndex: async () => ({
            stationIdByRailwayAndNameZh: new Map([
                ['MIR.TsukubaExpress||秋叶原', 'MIR.TsukubaExpress.Akihabara']
            ])
        })
    }),
    'MIR.TsukubaExpress.Akihabara'
);

assert.equal(
    await resolvePanelStationIdForLine({
        lineId: 'Missing.Line',
        currentStationId: 'Fallback.Station',
        currentStationNameZh: '',
        getStationGroupsIndex: async () => new Map()
    }),
    'Fallback.Station'
);

assert.equal(
    await resolvePanelStationIdForLine({ lineId: '' }),
    null
);

console.log('panel station id resolver smoke ok');

import assert from 'node:assert/strict';

import {
    getStationsIndex,
    resolvePanelComputationStationIdForLine,
    resolvePanelStationIdForLine,
    resetPanelStationMetadataCachesForTest
} from '../src/features/panel/panelStation.js';

resetPanelStationMetadataCachesForTest();

const stationsIndex = await getStationsIndex({
    loadJson: async () => [
        {
            id: 'Rail.Line.TitleCodeStation',
            railway: 'Rail.Line',
            title: {
                'zh-Hans': '标题站号站',
                en: 'Title Code Station',
                code: 'RL01'
            }
        },
        {
            id: 'Rail.Line.TopLevelCodeStation',
            code: 'RL02',
            railway: 'Rail.Line',
            title: {
                'zh-Hans': '顶层站号站',
                en: 'Top Level Code Station',
                code: 'SHOULD_NOT_WIN'
            }
        }
    ]
});

assert.equal(stationsIndex.idToCode.get('Rail.Line.TitleCodeStation'), 'RL01');
assert.equal(stationsIndex.idToCode.get('Rail.Line.TopLevelCodeStation'), 'RL02');

{
    const args = {
        lineId: 'JR-East.Takasaki',
        currentStationId: 'Keisei.Main.KeiseiUeno',
        currentStationNameZh: '京成上野',
        getStationGroupsIndex: async () => new Map([
            [
                'Keisei.Main.KeiseiUeno',
                [
                    'JR-East.Utsunomiya.Ueno',
                    'Keisei.Main.KeiseiUeno'
                ]
            ]
        ]),
        getStationsIndex: async () => ({
            idToNameZh: new Map([
                ['JR-East.Utsunomiya.Ueno', '上野'],
                ['Keisei.Main.KeiseiUeno', '京成上野']
            ]),
            stationIdByRailwayAndNameZh: new Map([
                ['JR-East.Takasaki||上野', 'JR-East.Takasaki.Ueno'],
                ['Keisei.Main||京成上野', 'Keisei.Main.KeiseiUeno']
            ])
        })
    };
    const baseHit = await resolvePanelStationIdForLine(args);
    assert.equal(
        baseHit,
        'Keisei.Main.KeiseiUeno',
        'base resolver should preserve the visible station fallback when exact line/name matching fails'
    );

    const hit = await resolvePanelComputationStationIdForLine(args);
    assert.equal(
        hit,
        'JR-East.Takasaki.Ueno',
        'panel computation resolver should recover a hidden alternate line station from names in the visible transfer group'
    );
}

console.log('panel station code index smoke ok');

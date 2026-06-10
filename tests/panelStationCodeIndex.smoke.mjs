import assert from 'node:assert/strict';

import {
    getStationsIndex,
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

console.log('panel station code index smoke ok');

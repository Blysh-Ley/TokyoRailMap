import assert from 'node:assert/strict';

import { buildMenuModel } from '../src/features/menu/menu.js';

const model = buildMenuModel({
    companyObj: {
        Seibu: true
    },
    linesObj: {
        'Seibu.Ikebukuro': { company: 'Seibu', simplified: '池袋线', modes: ['all'] },
        'Seibu.S-Yurakucho': { company: 'Seibu', simplified: 'S-有乐町线', modes: ['all'] }
    },
    railwaysList: [
        { id: 'Seibu.Ikebukuro', stations: ['A', 'B'] },
        { id: 'Seibu.S-Yurakucho', stations: ['C', 'D'] }
    ],
    hiddenLineIds: new Set(['Seibu.S-Yurakucho'])
});

const seibu = model.companies.find((company) => company.companyName === 'Seibu');
assert.ok(seibu, 'menu model should keep the company if at least one line remains');
assert.deepEqual(
    seibu.lines.map((line) => line.lineId),
    ['Seibu.Ikebukuro'],
    'full-line alternate lines should be hidden from menu models'
);

console.log('menu hidden alternate lines smoke ok');

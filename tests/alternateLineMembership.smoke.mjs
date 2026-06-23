import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    buildAlternateTripSourceIndex,
    buildAlternateLineMembership,
    getAlternateTripSources,
    getPairMapValue
} from '../src/domain/alternateLineMembership.js';

const readJson = (relativePath) => JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8'));

const railways = readJson('data/railways.json');
const stations = readJson('data/stations.json');
const coordinates = readJson('data/coordinates.json');

const membership = buildAlternateLineMembership({ railways, stations, coordinates });

const stationHidden = (lineId) => Array.from(
    membership.stationMembershipHiddenIdsByLineId.get(lineId) || []
).sort((a, b) => a.localeCompare(b));

const highlightHidden = (lineId) => Array.from(
    membership.highlightHiddenIdsByLineId.get(lineId) || []
).sort((a, b) => a.localeCompare(b));

assert.deepEqual(
    stationHidden('Tobu.Nikko'),
    ['Tobu.Nikko.Kasukabe'],
    'single-point alternate station must be removed from that line membership'
);
assert.deepEqual(
    highlightHidden('Tobu.Nikko'),
    ['Tobu.Nikko.Kasukabe', 'Tobu.Nikko.TobuDobutsuKoen'].sort((a, b) => a.localeCompare(b)),
    'single-point alternate highlight removal must expand to the real boundary station'
);
assert.equal(
    getPairMapValue(membership.alternateLineIdByLineStationId, 'Tobu.Nikko', 'Tobu.Nikko.Kasukabe'),
    'Tobu.TobuSkytree'
);
{
    const tripSourceIndex = buildAlternateTripSourceIndex(membership);
    assert.deepEqual(
        getAlternateTripSources(tripSourceIndex, 'Tobu.TobuSkytree.Kasukabe', 'Tobu.TobuSkytree'),
        [{
            displayLineId: 'Tobu.TobuSkytree',
            displayStationId: 'Tobu.TobuSkytree.Kasukabe',
            sourceLineId: 'Tobu.Nikko',
            sourceStationId: 'Tobu.Nikko.Kasukabe'
        }],
        'hidden alternate station trips should be attachable to the alternate station and line'
    );
}
assert.equal(
    getPairMapValue(membership.highlightAlternateLineIdByLineStationId, 'Tobu.Nikko', 'Tobu.Nikko.TobuDobutsuKoen'),
    'Tobu.TobuSkytree',
    'expanded boundary highlight segment must inherit the adjacent alternate line color'
);

assert.deepEqual(
    stationHidden('JR-East.Joban'),
    ['JR-East.Joban.Kashiwa', 'JR-East.Joban.Nippori', 'JR-East.Joban.Ueno'],
    'non-full continuous alternate stations must be removed from that line membership'
);
assert.deepEqual(
    highlightHidden('JR-East.Joban'),
    ['JR-East.Joban.Kashiwa', 'JR-East.Joban.Nippori', 'JR-East.Joban.Toride', 'JR-East.Joban.Ueno'].sort((a, b) => a.localeCompare(b)),
    'non-full continuous alternate highlight removal must expand to the following boundary station'
);
assert.equal(
    getPairMapValue(membership.highlightAlternateLineIdByLineStationId, 'JR-East.Joban', 'JR-East.Joban.Toride'),
    'JR-East.JobanRapid'
);

assert.deepEqual(
    stationHidden('TokyoMetro.Chiyoda'),
    ['TokyoMetro.Chiyoda.Machida', 'TokyoMetro.Chiyoda.SeijogakuenMae'],
    'continuous alternate stations at a line edge must be removed from membership'
);
assert.deepEqual(
    highlightHidden('TokyoMetro.Chiyoda'),
    [
        'TokyoMetro.Chiyoda.Machida',
        'TokyoMetro.Chiyoda.SeijogakuenMae',
        'TokyoMetro.Chiyoda.YoyogiUehara'
    ].sort((a, b) => a.localeCompare(b)),
    'continuous alternate highlight removal must include the next real boundary'
);
assert.equal(
    getPairMapValue(membership.highlightAlternateLineIdByLineStationId, 'TokyoMetro.Chiyoda', 'TokyoMetro.Chiyoda.YoyogiUehara'),
    'Odakyu.Odawara'
);

assert.ok(
    membership.fullAlternateLineIds.has('Seibu.S-Yurakucho'),
    'full-line alternate should be marked for menu and panel hiding'
);
assert.deepEqual(
    stationHidden('Seibu.S-Yurakucho'),
    ['Seibu.S-Yurakucho.Iidabashi', 'Seibu.S-Yurakucho.Nerima', 'Seibu.S-Yurakucho.ShakujiiKoen'].sort((a, b) => a.localeCompare(b))
);
assert.deepEqual(stationHidden('Seibu.S-Yurakucho'), highlightHidden('Seibu.S-Yurakucho'));

const fullLineRules = membership.rangeRules.filter((rule) => rule.isFullLine).map((rule) => rule.lineId).sort((a, b) => a.localeCompare(b));
assert.deepEqual(fullLineRules, Array.from(membership.fullAlternateLineIds).sort((a, b) => a.localeCompare(b)));
assert.deepEqual(fullLineRules, [
    'JR-East.MusashinoKunitachiBranch',
    'JR-East.MusashinoNishiUrawaBranch',
    'JR-East.MusashinoOmiyaBranch',
    'JR-East.OsakiBranch',
    'JR-East.TokaidoFreight',
    'JR-East.YamanoteFreight',
    'Odakyu.JROdakyuConnection',
    'Seibu.S-Fukutoshin',
    'Seibu.S-Yurakucho',
    'Seibu.SeibuChichibuBranch',
    'Tobu.JRTobuConnection'
]);

const singlePointRules = membership.rangeRules.filter((rule) => rule.kind === 'single-point-alternate');
assert.equal(singlePointRules.length, 10, 'all current single-point alternates should be classified');
assert.ok(
    singlePointRules.every((rule) => rule.boundaryExpansionStationIds.length === 1),
    'each current single-point alternate should expand to one adjacent boundary station'
);

const jobanRule = membership.rangeRules.find((rule) => rule.lineId === 'JR-East.Joban');
assert.deepEqual(jobanRule?.borrowedGeometryLineIds, ['JR-East.JobanRapid']);

console.log('alternate line membership smoke ok');

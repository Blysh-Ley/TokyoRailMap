import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    buildAlternateLineMembership,
    filterLineStationIdsForAlternateMembership
} from '../src/domain/alternateLineMembership.js';

const readJson = (relativePath) => JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8'));

const railways = readJson('data/railways.json');
const stations = readJson('data/stations.json');
const coordinates = readJson('data/coordinates.json');
const membership = buildAlternateLineMembership({ railways, stations, coordinates });
const railwayById = new Map(railways.map((railway) => [railway.id, railway]));

const filteredStations = (lineId) => filterLineStationIdsForAlternateMembership(
    lineId,
    railwayById.get(lineId)?.stations || [],
    membership
);

assert.equal(
    filteredStations('Tobu.Nikko')[0],
    'Tobu.Nikko.TobuDobutsuKoen',
    'route-map station order must drop the leaked head station while keeping the true boundary'
);
assert.equal(
    filteredStations('JR-East.Joban')[0],
    'JR-East.Joban.Toride',
    'route-map station order must drop leaked continuous alternate stations at the edge'
);
assert.equal(
    filteredStations('TokyoMetro.Chiyoda')[0],
    'TokyoMetro.Chiyoda.YoyogiUehara',
    'route-map station order must keep the real boundary after removing leaked Odakyu stations'
);
assert.deepEqual(
    filteredStations('Seibu.S-Yurakucho'),
    [],
    'full-line alternates should not expose route-map stations'
);

const routeMapSource = readFileSync(join(process.cwd(), 'src/features/route-map/route-map.js'), 'utf8');
const printSource = readFileSync(join(process.cwd(), 'src/features/print/print-timetables.js'), 'utf8');
assert.match(routeMapSource, /filterLineStationIdsForAlternateMembership\(/);
assert.match(printSource, /filterLineStationIdsForAlternateMembership\(/);

console.log('route map alternate membership smoke ok');

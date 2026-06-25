import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    buildThroughServiceDerivedState,
    THROUGH_SERVICE_CONFIGS
} from '../src/lib/throughServiceManager.js';
import {
    THROUGH_STATION_IDS_BY_CATEGORY_FIXTURE
} from './fixtures/throughServiceStationIdsByCategory.fixture.mjs';

const railways = JSON.parse(fs.readFileSync('data/railways.json', 'utf8'));
const railwayById = new Map(railways.map((railway) => [railway.id, railway]));

for (const config of THROUGH_SERVICE_CONFIGS) {
    assert.ok(config.lineId.startsWith('TokyoRail.Temp.'), `${config.category} should use canonical temp lineId`);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'tempId'), false, `${config.category} should not expose tempId`);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'routeIds'), false, `${config.category} should not expose routeIds`);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'triggerLineIds'), false, `${config.category} should not expose triggerLineIds`);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'excludeLineIds'), false, `${config.category} should not expose excludeLineIds`);
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'triggerStations'), false, `${config.category} should not expose triggerStations`);

    for (const segment of config.segments) {
        const railway = railwayById.get(segment.lineId);
        assert.ok(railway, `${config.category} segment line exists: ${segment.lineId}`);
        assert.ok(railway.stations.includes(segment.from), `${config.category} segment from exists: ${segment.from}`);
        assert.ok(railway.stations.includes(segment.to), `${config.category} segment to exists: ${segment.to}`);
        for (const skipped of segment.skipStations || []) {
            assert.ok(railway.stations.includes(skipped), `${config.category} skip station exists: ${skipped}`);
        }
    }
}

const derivedState = buildThroughServiceDerivedState({ railways });

for (const config of THROUGH_SERVICE_CONFIGS) {
    const derived = derivedState.infoByCategory[config.category];
    const expected = THROUGH_STATION_IDS_BY_CATEGORY_FIXTURE[config.category];
    assert.deepEqual(
        [...derived.stations].sort(),
        [...expected].sort(),
        `${config.category} generated stations match legacy validation set`
    );
    assert.equal(new Set(derived.stations).size, derived.stations.length, `${config.category} generated stations are unique`);
    assert.deepEqual(
        derived.segmentLineIds,
        [...new Set(config.segments.map((segment) => segment.lineId))],
        `${config.category} segmentLineIds derive from segments`
    );
}

console.log('through service config ranges smoke ok');

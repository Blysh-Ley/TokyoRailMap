import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildAlternateLineMembership } from '../src/domain/alternateLineMembership.js';
import {
    expandStationSelectionLineIdsForAlternateSources
} from '../src/domain/selection.js';

{
    const alternateLineMembership = {
        alternateStationIdByLineStationId: new Map([
            ['ALT\u0000ALT.VisibleStation', 'BASE.VisibleStation']
        ]),
        alternateLineIdByLineStationId: new Map([
            ['ALT\u0000ALT.VisibleStation', 'BASE']
        ])
    };

    assert.deepEqual(
        expandStationSelectionLineIdsForAlternateSources({
            stationId: 'Clicked.Station',
            stationIds: ['BASE.VisibleStation'],
            lineIds: ['BASE'],
            alternateLineMembership
        }),
        ['BASE', 'ALT'],
        'station selection should include hidden alternate source lines from visible transfer anchors'
    );

    assert.deepEqual(
        expandStationSelectionLineIdsForAlternateSources({
            stationId: 'Clicked.Station',
            stationIds: [],
            lineIds: ['BASE'],
            alternateLineMembership
        }),
        ['BASE'],
        'unrelated clicked station should not invent alternate lines without a matching anchor'
    );
}

{
    const railways = JSON.parse(fs.readFileSync('data/railways.json', 'utf8'));
    const stations = JSON.parse(fs.readFileSync('data/stations.json', 'utf8'));
    const coordinates = JSON.parse(fs.readFileSync('data/coordinates.json', 'utf8'));
    const stationGroups = JSON.parse(fs.readFileSync('data/station-groups.json', 'utf8'));
    const alternateLineMembership = buildAlternateLineMembership({ railways, stations, coordinates });

    const stationById = new Map(stations.map((station) => [String(station?.id || '').trim(), station]));
    const uenoGroup = stationGroups.find((group) => JSON.stringify(group).includes('Keisei.Main.KeiseiUeno'));
    const rawGroupIds = uenoGroup
        .flat(Infinity)
        .map((id) => String(id || '').trim())
        .filter(Boolean);
    const rawGroupSet = new Set(rawGroupIds);
    const visibleGroupIds = rawGroupIds.filter((id) => {
        const alternate = String(stationById.get(id)?.alternate || '').trim();
        return !(alternate && rawGroupSet.has(alternate));
    });

    const keiseiUenoGeneratedServingIds = [
        'JR-East.JobanRapid',
        'JR-East.KeihinTohokuNegishi',
        'JR-East.Utsunomiya',
        'JR-East.Yamanote',
        'Keisei.Main',
        'Keisei.NaritaSkyAccess',
        'TokyoMetro.Ginza',
        'TokyoMetro.Hibiya'
    ];

    assert.equal(
        keiseiUenoGeneratedServingIds.includes('JR-East.Takasaki'),
        false,
        'generated Keisei-Ueno serving ids omit hidden Takasaki membership before selection expansion'
    );

    const expanded = expandStationSelectionLineIdsForAlternateSources({
        stationId: 'Keisei.Main.KeiseiUeno',
        stationIds: visibleGroupIds,
        lineIds: keiseiUenoGeneratedServingIds,
        alternateLineMembership
    });

    assert.ok(
        expanded.includes('JR-East.Takasaki'),
        'Keisei-Ueno station selection should recover Takasaki Line through the visible Utsunomiya anchor'
    );
}

console.log('station selection alternate sources smoke ok');

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

globalThis.window = {
    location: { href: `file://${root.replace(/ /g, '%20')}/index.html` },
    TokyoRailElectron: {
        async readLocalFile(url) {
            const filePath = decodeURIComponent(new URL(url).pathname);
            const body = await fs.readFile(filePath);
            return {
                status: 200,
                statusText: 'OK',
                headers: [['content-type', 'application/json']],
                bodyBase64: body.toString('base64')
            };
        }
    }
};

const { analyzeBranchesForLine } = await import('../src/map/analyze_branch.js');
const {
    buildPanelStationThroughPreviewRequests,
    resolvePanelDirectionPreviewVisualLineId
} = await import('../src/features/panel/panelStation.js');
const { initializeThroughServiceStationIndex } = await import('../src/lib/throughServiceManager.js');

const railways = JSON.parse(await fs.readFile(path.join(root, 'data/railways.json'), 'utf8'));
initializeThroughServiceStationIndex({ railways });

const uenoTokyoRequest = {
    lineId: 'JR-East.Utsunomiya',
    sourceLineIds: ['JR-East.Utsunomiya', 'JR-East.Takasaki']
};
assert.equal(
    resolvePanelDirectionPreviewVisualLineId(uenoTokyoRequest),
    'JR-East.Utsunomiya',
    'direction preview should resolve its visual station from the displayed line instead of every analysis source line'
);

const lineDirKey = 'Keisei.Main||Inbound';
const request = buildPanelStationThroughPreviewRequests({
    dirPreviewMetaByKey: new Map([[lineDirKey, {
        lineId: 'Keisei.Main',
        originStationIds: ['Keisei.Main.KeiseiTsudanuma'],
        terminalStationIds: ['Keisei.Main.KeiseiUeno']
    }]]),
    dirFilteredTripKeysByKey: new Map([[lineDirKey, ['Keisei.Main.500.Weekday']]]),
    exactTargetTripKeys: true
})[0];
assert.equal(request?.exactTargetTripKeys, true);

const keiseiTrips = JSON.parse(
    await fs.readFile(path.join(root, 'data/train-timetables/keisei-main.json'), 'utf8')
);
const selectedWeekdayInboundTrips = keiseiTrips.filter((trip) => (
    String(trip?.d || '') === 'Inbound'
    && /\.Weekday(?:\.[0-9]+)?$/.test(String(trip?.id || ''))
    && (Array.isArray(trip?.tt) ? trip.tt : [])
        .some((stop) => String(stop?.s || '') === 'Keisei.Main.KeiseiUeno')
));
const targetTripKeys = Array.from(new Set(
    selectedWeekdayInboundTrips
        .flatMap((trip) => [trip?.id, trip?.n])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
));
const anchorStationIds = Array.from(new Set(
    selectedWeekdayInboundTrips
        .flatMap((trip) => [
            ...(Array.isArray(trip?.os) ? trip.os : []),
            ...(Array.isArray(trip?.ds) ? trip.ds : [])
        ])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
));

assert.equal(selectedWeekdayInboundTrips.length, 180);

const exactResult = await analyzeBranchesForLine('Keisei.Main', {
    targetTripKeys,
    anchorStationIds,
    exactTargetTripKeys: true
});
assert.equal(
    exactResult?.targetCount,
    selectedWeekdayInboundTrips.length,
    'exact direction filtering must not add same-number trips from another service day'
);
assert.equal(
    (exactResult?.fullRouteChains || []).some((route) => (
        (route?.stationIds || []).some((stationId) => String(stationId).includes('HanedaAirport'))
    )),
    false,
    'Keisei Ueno-bound weekday filtering must not highlight the Haneda Airport branch'
);

const compatibleResult = await analyzeBranchesForLine('Keisei.Main', {
    targetTripKeys,
    anchorStationIds
});
assert.ok(
    Number(compatibleResult?.targetCount || 0) > selectedWeekdayInboundTrips.length,
    'the default analysis mode must retain legacy cross-service-day base-key matching'
);

console.log('panel direction filter preview smoke ok');

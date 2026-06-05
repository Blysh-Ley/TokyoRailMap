import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { estimateFareForJourneyPlan } from '../src/domain/fareEstimate.js';

const fareGraph = JSON.parse(
    readFileSync(new URL('../data/fare-map-tokyo/fare_graph.json', import.meta.url), 'utf8')
);
const stationGraph = JSON.parse(
    readFileSync(new URL('../data/fare-map-tokyo/station_graph.json', import.meta.url), 'utf8')
);

{
    const estimate = estimateFareForJourneyPlan({
        fareGraph,
        stationGraph,
        displayPlan: {
            sections: [
                {
                    fromStop: 'Tokyu.Oimachi.Todoroki',
                    toStop: 'Tokyu.Oimachi.Oimachi',
                    lineIds: ['Tokyu.Oimachi']
                },
                {
                    fromStop: 'JR-East.KeihinTohokuNegishi.Oimachi',
                    toStop: 'JR-East.SobuRapid.Kinshicho',
                    lineIds: ['JR-East.KeihinTohokuNegishi', 'JR-East.SobuRapid']
                }
            ]
        }
    });

    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 480);
    assert.deepEqual(estimate.segments.map((segment) => segment.amount), [227, 253]);
}

{
    const estimate = estimateFareForJourneyPlan({
        fareGraph,
        stationGraph,
        displayPlan: {
            sections: [
                {
                    fromStop: 'Tokyu.Oimachi.Todoroki',
                    toStop: 'Tokyu.Toyoko.MusashiKosugi',
                    lineIds: ['Tokyu.Oimachi', 'Tokyu.Toyoko', 'Minatomirai.Minatomirai']
                },
                {
                    fromStop: 'JR-East.Yokosuka.MusashiKosugi',
                    toStop: 'JR-East.SobuRapid.Kinshicho',
                    lineIds: ['JR-East.SobuRapid', 'JR-East.Yokosuka']
                }
            ]
        }
    });

    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 620);
    assert.deepEqual(estimate.segments.map((segment) => segment.amount), [180, 440]);
}

{
    const estimate = estimateFareForJourneyPlan({
        fareGraph,
        stationGraph,
        displayPlan: {
            sections: [
                {
                    fromStop: 'Tokyu.Oimachi.Todoroki',
                    toStop: 'TokyoMetro.Hanzomon.Kinshicho',
                    lineIds: ['Tokyu.Oimachi', 'Tokyu.Denentoshi', 'TokyoMetro.Hanzomon'],
                    legs: [
                        {
                            fromStop: 'Tokyu.Oimachi.Todoroki',
                            toStop: 'Tokyu.Oimachi.FutakoTamagawa',
                            lineId: 'Tokyu.Oimachi'
                        },
                        {
                            fromStop: 'Tokyu.Denentoshi.FutakoTamagawa',
                            toStop: 'Tokyu.Denentoshi.Shibuya',
                            lineId: 'Tokyu.Denentoshi'
                        },
                        {
                            fromStop: 'TokyoMetro.Hanzomon.Shibuya',
                            toStop: 'TokyoMetro.Hanzomon.Kinshicho',
                            lineId: 'TokyoMetro.Hanzomon'
                        }
                    ]
                }
            ]
        }
    });

    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 479);
    assert.deepEqual(estimate.segments.map((segment) => segment.amount), [227, 252]);
    assert.deepEqual(
        estimate.segments[0].farePath,
        ['Tokyu.Todoroki', 'Tokyu.Shibuya']
    );
    assert.deepEqual(
        estimate.segments.map((segment) => [segment.fromFareStationId, segment.toFareStationId]),
        [
            ['Tokyu.Todoroki', 'Tokyu.Shibuya'],
            ['TokyoMetro.Shibuya', 'TokyoMetro.Kinshicho']
        ]
    );
    assert.deepEqual(estimate.adjustments, []);
}

{
    const estimate = estimateFareForJourneyPlan({
        fareGraph,
        stationGraph,
        displayPlan: {
            sections: [
                {
                    fromStop: 'Tokyu.Oimachi.Todoroki',
                    toStop: 'Tokyu.Oimachi.FutakoTamagawa',
                    lineIds: ['Tokyu.Oimachi', 'Tokyu.DenEnToshi']
                },
                {
                    fromStop: 'Tokyu.DenEnToshi.FutakoTamagawa',
                    toStop: 'TokyoMetro.Hanzomon.Kinshicho',
                    lineIds: ['TokyoMetro.Hanzomon', 'Tokyu.DenEnToshi', 'Tobu.TobuSkytreeBranch']
                }
            ]
        }
    });

    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 479);
    assert.deepEqual(estimate.segments.map((segment) => segment.amount), [227, 252]);
    assert.deepEqual(
        estimate.segments.map((segment) => [segment.fromFareStationId, segment.toFareStationId]),
        [
            ['Tokyu.Todoroki', 'Tokyu.Shibuya'],
            ['TokyoMetro.Shibuya', 'TokyoMetro.Kinshicho']
        ]
    );
    assert.deepEqual(estimate.adjustments, []);
}

{
    const estimate = estimateFareForJourneyPlan({
        fareGraph,
        stationGraph,
        displayPlan: {
            sections: [
                {
                    fromStop: 'TokyoMetro.Hanzomon.Kinshicho',
                    toStop: 'Tokyu.DenEnToshi.FutakoTamagawa',
                    lineIds: ['TokyoMetro.Hanzomon', 'Tokyu.DenEnToshi', 'Tobu.TobuSkytreeBranch']
                },
                {
                    fromStop: 'Tokyu.Oimachi.FutakoTamagawa',
                    toStop: 'Tokyu.Oimachi.Todoroki',
                    lineIds: ['Tokyu.Oimachi', 'Tokyu.DenEnToshi']
                }
            ]
        }
    });

    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 479);
    assert.deepEqual(estimate.segments.map((segment) => segment.amount), [252, 227]);
    assert.deepEqual(
        estimate.segments.map((segment) => [segment.fromFareStationId, segment.toFareStationId]),
        [
            ['TokyoMetro.Kinshicho', 'TokyoMetro.Shibuya'],
            ['Tokyu.Shibuya', 'Tokyu.Todoroki']
        ]
    );
    assert.deepEqual(estimate.adjustments, []);
}

console.log('fare estimate Todoroki Kinshicho smoke ok');

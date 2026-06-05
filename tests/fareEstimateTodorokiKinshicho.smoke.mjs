import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { estimateFareForJourneyPlan } from '../src/domain/fareEstimate.js';

const fareGraph = JSON.parse(
    readFileSync(new URL('../data/fare-map-tokyo/fare_graph.json', import.meta.url), 'utf8')
);

{
    const estimate = estimateFareForJourneyPlan({
        fareGraph,
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
    assert.equal(estimate.segments[0].amount, 479);
    assert.deepEqual(
        estimate.segments[0].farePath,
        ['Tokyu.Todoroki', 'Tokyu.Shibuya', 'TokyoMetro.Shibuya', 'TokyoMetro.Kinshicho']
    );
    assert.deepEqual(estimate.segments[0].fareDetails.map((detail) => detail.amount), [227, 0, 252]);
}

console.log('fare estimate Todoroki Kinshicho smoke ok');

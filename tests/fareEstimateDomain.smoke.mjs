import assert from 'node:assert/strict';

import {
    buildFareChainFromDisplayPlan,
    estimateFareForJourneyPlan,
    mapStopIdToFareStationId
} from '../src/domain/fareEstimate.js';

assert.equal(
    mapStopIdToFareStationId('JR-East.Yamanote.Shinjuku'),
    'JR-East.Shinjuku'
);
assert.equal(
    mapStopIdToFareStationId('TokyoMetro.Ginza'),
    'TokyoMetro.Ginza'
);

{
    const displayPlan = {
        sections: [
            {
                fromStop: 'JR-East.Yamanote.Shinjuku',
                toStop: 'JR-East.Yamanote.Kanda',
                lineIds: ['JR-East.Yamanote']
            },
            {
                fromStop: 'JR-East.ChuoRapid.Kanda',
                toStop: 'JR-East.ChuoRapid.Tokyo',
                lineIds: ['JR-East.ChuoRapid']
            }
        ]
    };

    const chain = buildFareChainFromDisplayPlan(displayPlan);
    assert.equal(chain.length, 1);
    assert.equal(chain[0].fromFareStationId, 'JR-East.Shinjuku');
    assert.equal(chain[0].toFareStationId, 'JR-East.Tokyo');
    assert.deepEqual(chain[0].lineIds, ['JR-East.Yamanote', 'JR-East.ChuoRapid']);
}

{
    const displayPlan = {
        sections: [
            {
                fromStop: 'JR-East.Yamanote.Shinjuku',
                toStop: 'JR-East.ChuoRapid.Tokyo',
                lineIds: ['JR-East.Yamanote', 'JR-East.ChuoRapid']
            },
            {
                fromStop: 'JR-East.ChuoRapid.Tokyo',
                toStop: 'TokyoMetro.Marunouchi.Tokyo',
                lineIds: []
            },
            {
                fromStop: 'TokyoMetro.Marunouchi.Tokyo',
                toStop: 'TokyoMetro.Marunouchi.Ginza',
                lineIds: ['TokyoMetro.Marunouchi']
            }
        ]
    };
    const fareGraph = {
        'JR-East.Shinjuku': {
            'JR-East.Tokyo': { ic_card_fare: 210, ticket_fare: 210 }
        },
        'JR-East.Tokyo': {
            'TokyoMetro.Tokyo': { ic_card_fare: 0, ticket_fare: 0 }
        },
        'TokyoMetro.Tokyo': {
            'TokyoMetro.Ginza': { ic_card_fare: 178, ticket_fare: 180 }
        }
    };

    const estimate = estimateFareForJourneyPlan({ displayPlan, fareGraph });
    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 388);
    assert.equal(estimate.segments.length, 3);
    assert.deepEqual(estimate.missingSegments, []);
}

{
    const displayPlan = {
        legs: [
            {
                fromStop: 'JR-East.Yamanote.Shinjuku',
                toStop: 'TokyoMetro.Marunouchi.Ginza',
                lineId: 'TokyoMetro.Marunouchi'
            }
        ]
    };

    const estimate = estimateFareForJourneyPlan({
        displayPlan,
        fareGraph: {
            'JR-East.Shinjuku': {}
        }
    });
    assert.equal(estimate.confidence, 'partial');
    assert.equal(estimate.totalAmount, 0);
    assert.equal(estimate.missingSegments.length, 1);
    assert.equal(estimate.missingSegments[0].reason, 'missing-fare-edge');
}

{
    const estimate = estimateFareForJourneyPlan({
        displayPlan: { legs: [{ fromStop: 'JR-East.Yamanote.Shinjuku', toStop: 'JR-East.Yamanote.Tokyo' }] },
        fareGraph: null
    });
    assert.equal(estimate.confidence, 'missing-data');
    assert.equal(estimate.totalAmount, null);
    assert.equal(estimate.missingSegments[0].reason, 'missing-fare-graph');
}

console.log('fare estimate domain smoke ok');

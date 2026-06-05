import assert from 'node:assert/strict';

import {
    buildFareChainFromDisplayPlan,
    estimateFareForJourneyPlan,
    findFareGraphPath,
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
    const pathResult = findFareGraphPath({
        fromFareStationId: 'TokyoMetro.Wakoshi',
        toFareStationId: 'Tokyu.Jiyugaoka',
        fareGraph: {
            'TokyoMetro.Wakoshi': {
                'TokyoMetro.Shibuya': { ic_card_fare: 324 }
            },
            'TokyoMetro.Shibuya': {
                'Tokyu.Shibuya': { ic_card_fare: 0 }
            },
            'Tokyu.Shibuya': {
                'Tokyu.Jiyugaoka': { ic_card_fare: 178 }
            }
        }
    });
    assert.equal(pathResult.amount, 502);
    assert.deepEqual(pathResult.path, ['TokyoMetro.Wakoshi', 'TokyoMetro.Shibuya', 'Tokyu.Shibuya', 'Tokyu.Jiyugaoka']);
}

{
    const displayPlan = {
        legs: [
            {
                fromStop: 'TokyoMetro.Fukutoshin.Wakoshi',
                toStop: 'Tokyu.Toyoko.Jiyugaoka',
                lineId: 'TokyoMetro.Fukutoshin'
            }
        ]
    };
    const estimate = estimateFareForJourneyPlan({
        displayPlan,
        fareGraph: {
            'TokyoMetro.Wakoshi': {
                'TokyoMetro.Shibuya': { ic_card_fare: 324 }
            },
            'TokyoMetro.Shibuya': {
                'Tokyu.Shibuya': { ic_card_fare: 0 }
            },
            'Tokyu.Shibuya': {
                'Tokyu.Jiyugaoka': { ic_card_fare: 178 }
            }
        }
    });

    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 502);
    assert.equal(estimate.segments[0].matchType, 'fare-graph-path');
    assert.deepEqual(estimate.segments[0].fareDetails.map((x) => x.amount), [324, 0, 178]);
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
    assert.equal(estimate.missingSegments[0].reason, 'missing-fare-path');
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

{
    const displayPlan = {
        sections: [
            {
                fromStop: 'TokyoMetro.Ginza.Shibuya',
                toStop: 'TokyoMetro.Ginza.AoyamaItchome',
                lineIds: ['TokyoMetro.Ginza']
            },
            {
                fromStop: 'Toei.Oedo.AoyamaItchome',
                toStop: 'Toei.Oedo.Roppongi',
                lineIds: ['Toei.Oedo']
            }
        ]
    };
    const fareGraph = {
        'TokyoMetro.Shibuya': {
            'TokyoMetro.AoyamaItchome': { ic_card_fare: 178 }
        },
        'Toei.AoyamaItchome': {
            'Toei.Roppongi': { ic_card_fare: 178 }
        }
    };

    const estimate = estimateFareForJourneyPlan({ displayPlan, fareGraph });
    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 286);
    assert.deepEqual(estimate.adjustments.map((x) => x.type), ['metro-toei-transfer-discount']);
}

{
    const displayPlan = {
        sections: [
            {
                fromStop: 'Keio.Keio.Chofu',
                toStop: 'Toei.Shinjuku.Jimbocho',
                lineIds: ['Keio.Keio', 'Toei.Shinjuku']
            }
        ]
    };
    const fareGraph = {
        'Keio.Chofu': {
            'Keio.Shibuya': { ic_card_fare: 273 },
            'Keio.Shinjuku': { ic_card_fare: 273 }
        },
        'Keio.Shibuya': {
            'TokyoMetro.Shibuya': { ic_card_fare: 0 }
        },
        'TokyoMetro.Shibuya': {
            'TokyoMetro.Jimbocho': { ic_card_fare: 209 }
        },
        'TokyoMetro.Jimbocho': {
            'Toei.Jimbocho': { ic_card_fare: 0 }
        },
        'Keio.Shinjuku': {
            'Toei.Shinjuku': { ic_card_fare: 0 }
        },
        'Toei.Shinjuku': {
            'Toei.Jimbocho': { ic_card_fare: 220 }
        }
    };

    const estimate = estimateFareForJourneyPlan({ displayPlan, fareGraph });
    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 493);
    assert.deepEqual(
        estimate.segments[0].farePath,
        ['Keio.Chofu', 'Keio.Shinjuku', 'Toei.Shinjuku', 'Toei.Jimbocho']
    );
}

{
    const displayPlan = {
        sections: [
            {
                fromStop: 'TokyoMetro.Fukutoshin.Wakoshi',
                toStop: 'Tokyu.Toyoko.Jiyugaoka',
                lineIds: ['TokyoMetro.Fukutoshin', 'Tokyu.Toyoko'],
                legs: [
                    {
                        fromStop: 'TokyoMetro.Fukutoshin.Wakoshi',
                        toStop: 'TokyoMetro.Fukutoshin.Shibuya',
                        lineId: 'TokyoMetro.Fukutoshin'
                    },
                    {
                        fromStop: 'Tokyu.Toyoko.Shibuya',
                        toStop: 'Tokyu.Toyoko.Jiyugaoka',
                        lineId: 'Tokyu.Toyoko'
                    }
                ]
            }
        ]
    };
    const fareGraph = {
        'TokyoMetro.Wakoshi': {
            'TokyoMetro.NakaMeguro': { ic_card_fare: 293 },
            'TokyoMetro.Shibuya': { ic_card_fare: 293 }
        },
        'TokyoMetro.NakaMeguro': {
            'Tokyu.NakaMeguro': { ic_card_fare: 0 }
        },
        'Tokyu.NakaMeguro': {
            'Tokyu.Jiyugaoka': { ic_card_fare: 180 }
        },
        'TokyoMetro.Shibuya': {
            'Tokyu.Shibuya': { ic_card_fare: 0 }
        },
        'Tokyu.Shibuya': {
            'Tokyu.Jiyugaoka': { ic_card_fare: 180 }
        }
    };

    const estimate = estimateFareForJourneyPlan({ displayPlan, fareGraph });
    assert.equal(estimate.confidence, 'complete');
    assert.equal(estimate.totalAmount, 473);
    assert.deepEqual(
        estimate.segments[0].farePath,
        ['TokyoMetro.Wakoshi', 'TokyoMetro.Shibuya', 'Tokyu.Shibuya', 'Tokyu.Jiyugaoka']
    );
}

console.log('fare estimate domain smoke ok');
